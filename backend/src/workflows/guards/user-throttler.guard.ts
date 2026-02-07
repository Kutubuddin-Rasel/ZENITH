import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
    ThrottlerGuard,
    ThrottlerModuleOptions,
    ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * Workflow throttle metadata key
 */
export const WORKFLOW_THROTTLE_KEY = 'workflow_throttle';

/**
 * Workflow throttle configuration
 */
export interface WorkflowThrottleConfig {
    limit: number;
    ttl: number; // seconds
}

/**
 * Decorator to specify workflow-specific rate limits
 *
 * @example
 * @WorkflowThrottle({ limit: 10, ttl: 60 })
 * @Post(':id/execute')
 * async executeWorkflow() { ... }
 */
export function WorkflowThrottle(config: WorkflowThrottleConfig): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        Reflect.defineMetadata(WORKFLOW_THROTTLE_KEY, config, descriptor.value!);
        return descriptor;
    };
}

/**
 * UserThrottlerGuard - User-Based Rate Limiting for Workflows
 *
 * SECURITY (Phase 5): Prevents DoS via "Workflow Bombing"
 *
 * Key differences from IP-based throttling:
 * 1. Tracks by userId + endpoint (not IP)
 * 2. Shared offices/VPNs don't affect other users
 * 3. Per-endpoint limits allow stricter execution limits
 *
 * Limits:
 * - Execute workflow: 10/min (expensive operation)
 * - Retry execution: 5/min (prevent retry spam)
 * - Read operations: 100/min (standard browsing)
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
    private readonly logger = new Logger(UserThrottlerGuard.name);

    constructor(
        options: ThrottlerModuleOptions,
        storageService: ThrottlerStorage,
        reflector: Reflector,
        private readonly configService: ConfigService,
    ) {
        super(options, storageService, reflector);
    }

    /**
     * Generate tracking key based on userId + endpoint
     *
     * SECURITY: User-based tracking ensures:
     * - One malicious user cannot affect others
     * - Shared IP addresses (VPNs, offices) don't cause false positives
     */
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const user = req.user as { id?: string } | undefined;
        const userId = user?.id || 'anonymous';
        const url = req.url as string || 'unknown';

        // Format: user:{userId}:{endpoint}
        return `user:${userId}:${url}`;
    }

    /**
     * Get rate limit for current request
     */
    protected async getLimit(context: ExecutionContext): Promise<number> {
        const config = this.getThrottleConfig(context);
        if (config) {
            return config.limit;
        }
        // Default: 100 requests per minute
        return 100;
    }

    /**
     * Get TTL for current request
     */
    protected async getTtl(context: ExecutionContext): Promise<number> {
        const config = this.getThrottleConfig(context);
        if (config) {
            return config.ttl * 1000; // Convert seconds to milliseconds
        }
        // Default: 1 minute
        return 60000;
    }

    /**
     * Get throttle config from decorator metadata
     */
    private getThrottleConfig(context: ExecutionContext): WorkflowThrottleConfig | undefined {
        const handler = context.getHandler();
        return Reflect.getMetadata(WORKFLOW_THROTTLE_KEY, handler) as WorkflowThrottleConfig | undefined;
    }
}
