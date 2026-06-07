import { Injectable } from '@nestjs/common';
import {
  AccessCheckResult,
  IAccessRuleCache,
  IEmergencyAccess,
} from '../interfaces/access-control.interfaces';
import { isIPMatch } from '../utils/ip-match.util';

@Injectable()
export class EmergencyAccessService extends IEmergencyAccess {
  constructor(private readonly cache: IAccessRuleCache) {
    super();
  }

  async check(
    ipAddress: string,
    organizationId?: string,
  ): Promise<AccessCheckResult> {
    const emergencyRules = await this.cache.getEmergencyRules(organizationId);

    for (const rule of emergencyRules) {
      if (
        isIPMatch(
          ipAddress,
          rule.ipAddress,
          rule.ipType,
          rule.endIpAddress || undefined,
        )
      ) {
        return {
          allowed: true,
          reason: `Emergency access granted: ${rule.emergencyReason}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metadata: { emergency: true, reason: rule.emergencyReason },
        };
      }
    }

    return { allowed: false, reason: 'No emergency access' };
  }
}
