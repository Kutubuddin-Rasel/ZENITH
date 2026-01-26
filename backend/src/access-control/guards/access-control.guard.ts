import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from '../access-control.service';
import { IpResolutionService } from '../services/ip-resolution.service';
import { Request, Response } from 'express';

/**
 * Access Control Guard
 *
 * Enforces IP-based access control rules on protected routes.
 *
 * SECURITY:
 * - Uses IpResolutionService for secure client IP resolution
 * - Only trusts X-Forwarded-For from configured trusted proxies
 * - Prevents header spoofing attacks
 */
@Injectable()
export class AccessControlGuard implements CanActivate {
  private readonly logger = new Logger(AccessControlGuard.name);

  constructor(
    private accessControlService: AccessControlService,
    private ipResolutionService: IpResolutionService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Skip access control for public routes
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) {
      return true;
    }

    // Get client IP address using secure resolution
    // This handles trusted proxy validation and X-Forwarded-For parsing
    const ipAddress = this.ipResolutionService.getClientIp(request);

    // Get user information from request
    const user = (request as unknown as Record<string, unknown>).user as
      | Record<string, unknown>
      | undefined;
    const userId = user?.userId as string | undefined;
    const userRoles = (user?.roles as string[]) || [];

    // Get project ID from request parameters or headers
    const projectIdParam =
      request.params?.id ||
      (Array.isArray(request.headers['x-project-id'])
        ? request.headers['x-project-id'][0]
        : request.headers['x-project-id']);

    // Narrow projectId to string (handle potential array from Express params)
    const projectId = Array.isArray(projectIdParam)
      ? projectIdParam[0]
      : projectIdParam;

    try {
      // Check access control
      const result = await this.accessControlService.checkAccess(
        ipAddress,
        userId,
        request.headers['user-agent'],
        projectId,
        userRoles,
      );

      if (!result.allowed) {
        this.logger.warn(`Access denied for IP ${ipAddress}: ${result.reason}`);

        // Set response headers for debugging (non-sensitive info only)
        response.setHeader('X-Access-Denied-Reason', result.reason);
        response.setHeader('X-Access-Rule-Id', result.ruleId || 'none');

        throw new ForbiddenException(`Access denied: ${result.reason}`);
      }

      // Add access control info to request for logging
      (request as unknown as Record<string, unknown>).accessControl = {
        allowed: true,
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        requiresApproval: result.requiresApproval,
        expiresAt: result.expiresAt,
        metadata: result.metadata,
        clientIp: ipAddress, // Include resolved IP for audit
      };

      this.logger.debug(`Access granted for IP ${ipAddress} to user ${userId}`);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error('Access control check failed', error);

      // On error, deny access by default for security
      throw new ForbiddenException('Access control error');
    }
  }
}
