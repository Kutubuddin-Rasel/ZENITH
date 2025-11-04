import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from '../access-control.service';
import { Request, Response } from 'express';

@Injectable()
export class AccessControlGuard implements CanActivate {
  private readonly logger = new Logger(AccessControlGuard.name);

  constructor(
    private accessControlService: AccessControlService,
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

    // Get client IP address
    const ipAddress = this.getClientIP(request);

    // Get user information from request
    const user = (request as unknown as Record<string, unknown>).user as
      | Record<string, unknown>
      | undefined;
    const userId = user?.userId as string | undefined;
    const userRoles = (user?.roles as string[]) || [];

    // Get project ID from request parameters or headers
    const projectId =
      request.params?.id ||
      (Array.isArray(request.headers['x-project-id'])
        ? request.headers['x-project-id'][0]
        : request.headers['x-project-id']);

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

        // Set response headers for debugging
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

  /**
   * Get client IP address from request
   */
  private getClientIP(request: Request): string {
    // Check for forwarded IP (from load balancer/proxy)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = forwardedFor.toString().split(',');
      return ips[0].trim();
    }

    // Check for real IP header
    const realIP = request.headers['x-real-ip'];
    if (realIP) {
      return realIP.toString();
    }

    // Check for client IP header
    const clientIP = request.headers['x-client-ip'];
    if (clientIP) {
      return clientIP.toString();
    }

    // Fallback to connection remote address
    return (
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }
}
