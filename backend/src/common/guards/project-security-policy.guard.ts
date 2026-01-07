import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectSecurityPolicyService } from '../../projects/project-security-policy.service';
import { TwoFactorAuthService } from '../../auth/services/two-factor-auth.service';

/**
 * Typed request interface for this guard
 */
interface GuardRequest {
  user?: {
    userId: string;
    isSuperAdmin: boolean;
  };
  params?: {
    id?: string;
    projectId?: string;
  };
  query?: {
    projectId?: string;
  };
}

/**
 * SKIP_POLICY_CHECK Decorator
 * Use to skip policy enforcement on specific routes
 */
export const SKIP_POLICY_CHECK = 'skipPolicyCheck';
export const SkipPolicyCheck = () => {
  return (
    target: object,
    key?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(
        SKIP_POLICY_CHECK,
        true,
        descriptor.value as object,
      );
    }
    return descriptor;
  };
};

/**
 * ProjectSecurityPolicyGuard
 *
 * Enforces project security policies on project-scoped routes.
 * Checks:
 * 1. If project requires 2FA, verify user has 2FA enabled
 * 2. (Future) Password complexity, session timeout, IP allowlist, etc.
 *
 * Usage: Apply to project-scoped controllers/routes
 *
 * Performance: Uses 30-second in-memory cache in ProjectSecurityPolicyService
 */
@Injectable()
export class ProjectSecurityPolicyGuard implements CanActivate {
  private readonly logger = new Logger(ProjectSecurityPolicyGuard.name);

  constructor(
    private readonly policyService: ProjectSecurityPolicyService,
    @Inject(forwardRef(() => TwoFactorAuthService))
    private readonly twoFactorService: TwoFactorAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked to skip policy check
    const skipCheck = this.reflector.get<boolean>(
      SKIP_POLICY_CHECK,
      context.getHandler(),
    );
    if (skipCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const user = request.user;

    // Must have an authenticated user
    if (!user?.userId) {
      return true; // Let auth guard handle this
    }

    // Extract project ID from route params or query
    const projectId =
      request.params?.id ||
      request.params?.projectId ||
      request.query?.projectId;

    // If no project context, skip policy enforcement
    if (!projectId) {
      return true;
    }

    // Super Admins bypass policy checks (they need access to fix issues)
    if (user.isSuperAdmin) {
      return true;
    }

    // Fetch project security policy (cached for 30 seconds)
    const policy = await this.policyService.getPolicy(projectId);

    // No policy = no restrictions
    if (!policy) {
      return true;
    }

    // Store violations for detailed error message
    const violations: string[] = [];

    // ============ ENFORCEMENT CHECKS ============

    // Check 1: 2FA Requirement
    if (policy.require2FA) {
      const has2FA = await this.twoFactorService.isEnabled(user.userId);
      if (!has2FA) {
        violations.push('2FA_NOT_ENABLED');
      }
    }

    // Check 2: (Future) Password Age
    // if (policy.passwordMaxAgeDays > 0 && user.lastPasswordChangeAt) {
    //   const daysSinceChange = daysBetween(user.lastPasswordChangeAt, new Date());
    //   if (daysSinceChange > policy.passwordMaxAgeDays) {
    //     violations.push('PASSWORD_EXPIRED');
    //   }
    // }

    // Check 3: (Future) IP Allowlist
    // if (policy.requireIPAllowlist) {
    //   const clientIP = request.ip;
    //   const isAllowed = await this.checkIPAllowlist(projectId, clientIP);
    //   if (!isAllowed) {
    //     violations.push('IP_NOT_ALLOWED');
    //   }
    // }

    // ============ HANDLE VIOLATIONS ============

    if (violations.length > 0) {
      // Log security event
      this.logger.warn(
        `Policy violation for user ${user.userId} on project ${projectId}: ${violations.join(', ')}`,
      );

      // Build user-friendly message
      const messages: Record<string, string> = {
        '2FA_NOT_ENABLED':
          'This project requires Two-Factor Authentication. Please enable 2FA in your security settings.',
        PASSWORD_EXPIRED:
          'Your password has expired. Please update your password.',
        IP_NOT_ALLOWED:
          'Your IP address is not on the allowlist for this project.',
      };

      const primaryViolation = violations[0];
      const message =
        messages[primaryViolation] ||
        'You do not meet the security requirements for this project.';

      throw new ForbiddenException({
        error: 'POLICY_VIOLATION',
        violations,
        message,
        redirectTo: '/settings/security',
        projectId,
      });
    }

    return true;
  }
}
