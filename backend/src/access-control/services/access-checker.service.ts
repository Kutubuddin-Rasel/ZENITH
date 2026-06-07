import { Injectable, Logger } from '@nestjs/common';
import {
  IPAccessRule,
  AccessRuleType,
} from '../entities/ip-access-rule.entity';
import { AccessRuleRepository } from '../repositories/abstract/access-rule.repository';
import {
  AccessCheckResult,
  IAccessAttemptAuditor,
  IAccessChecker,
  IAccessControlConfig,
  IAccessRuleCache,
  IEmergencyAccess,
  IGeoIpLookup,
  IPLocation,
} from '../interfaces/access-control.interfaces';
import { isIPMatch, isTimeAllowed } from '../utils/ip-match.util';

@Injectable()
export class AccessCheckerService extends IAccessChecker {
  private readonly logger = new Logger(AccessCheckerService.name);

  constructor(
    private readonly cache: IAccessRuleCache,
    private readonly emergency: IEmergencyAccess,
    private readonly geoIp: IGeoIpLookup,
    private readonly auditor: IAccessAttemptAuditor,
    private readonly accessRuleRepo: AccessRuleRepository,
    private readonly config: IAccessControlConfig,
  ) {
    super();
  }

  async checkAccess(
    ipAddress: string,
    userId?: string,
    userAgent?: string,
    projectId?: string,
    userRoles?: string[],
    organizationId?: string,
  ): Promise<AccessCheckResult> {
    if (!this.config.isEnabled) {
      return { allowed: true, reason: 'Access control disabled' };
    }

    try {
      const location = this.geoIp.lookup(ipAddress);

      if (this.config.emergencyAccessEnabled) {
        const emergencyResult = await this.emergency.check(
          ipAddress,
          organizationId,
        );
        if (emergencyResult.allowed) {
          return emergencyResult;
        }
      }

      const rules = await this.cache.getMergedRules(organizationId);

      for (const rule of rules) {
        const match = this.checkRuleMatch(
          rule,
          ipAddress,
          userId,
          projectId,
          userRoles,
          location || undefined,
        );
        if (match) {
          this.accessRuleRepo.incrementHitCount(rule.id).catch(() => {});

          const allowed =
            rule.ruleType === AccessRuleType.WHITELIST ||
            rule.ruleType === AccessRuleType.GEOGRAPHIC;

          await this.auditor.record({
            ipAddress,
            userId,
            userAgent,
            timestamp: new Date(),
            allowed,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            location: location || undefined,
            organizationId,
          });

          return {
            allowed,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            ruleName: rule.name,
            requiresApproval: rule.requiresApproval,
            expiresAt: rule.expiresAt || undefined,
            metadata: rule.metadata || undefined,
          };
        }
      }

      const allowed = this.config.defaultPolicy === 'allow';
      const reason = allowed
        ? 'No rules matched, default allow'
        : 'No rules matched, default deny';

      await this.auditor.record({
        ipAddress,
        userId,
        userAgent,
        timestamp: new Date(),
        allowed,
        reason,
        location: location || undefined,
        organizationId,
      });

      return { allowed, reason };
    } catch (error) {
      this.logger.error('Access control check failed', error);
      const allowed = this.config.defaultPolicy === 'allow';
      return {
        allowed,
        reason: `Access control error, default ${this.config.defaultPolicy}`,
      };
    }
  }

  private checkRuleMatch(
    rule: IPAccessRule,
    ipAddress: string,
    userId?: string,
    projectId?: string,
    userRoles?: string[],
    location?: IPLocation,
  ): boolean {
    if (
      rule.ruleType === AccessRuleType.USER_SPECIFIC &&
      rule.userId !== userId
    ) {
      return false;
    }

    if (rule.ruleType === AccessRuleType.ROLE_BASED && userRoles) {
      const hasMatchingRole = rule.allowedRoles?.some((role) =>
        userRoles.includes(role),
      );
      if (!hasMatchingRole) return false;
    }

    if (rule.allowedProjects && projectId) {
      if (!rule.allowedProjects.includes(projectId)) return false;
    }

    if (
      rule.ruleType === AccessRuleType.WHITELIST ||
      rule.ruleType === AccessRuleType.BLACKLIST
    ) {
      if (
        !isIPMatch(
          ipAddress,
          rule.ipAddress,
          rule.ipType,
          rule.endIpAddress || undefined,
        )
      ) {
        return false;
      }
    }

    if (rule.ruleType === AccessRuleType.GEOGRAPHIC && location) {
      if (rule.country && rule.country !== location.country) return false;
      if (rule.region && rule.region !== location.region) return false;
      if (rule.city && rule.city !== location.city) return false;
    }

    if (rule.ruleType === AccessRuleType.TIME_BASED) {
      if (!isTimeAllowed(rule)) return false;
    }

    return true;
  }
}
