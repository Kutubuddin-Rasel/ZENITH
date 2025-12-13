import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  IPAccessRule,
  AccessRuleType,
  AccessRuleStatus,
  IPType,
} from './entities/ip-access-rule.entity';
import { AuditService } from '../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../audit/entities/audit-log.entity';
import * as geoip from 'geoip-lite';
import * as cron from 'node-cron';

export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  ruleId?: string;
  ruleName?: string;
  requiresApproval?: boolean;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IPLocation {
  country: string;
  region: string;
  city: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

export interface AccessAttempt {
  ipAddress: string;
  userId?: string;
  userAgent?: string;
  timestamp: Date;
  allowed: boolean;
  reason: string;
  ruleId?: string;
  location?: IPLocation;
}

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);
  private readonly isEnabled: boolean;
  private readonly defaultPolicy: 'allow' | 'deny';
  private readonly emergencyAccessEnabled: boolean;

  constructor(
    @InjectRepository(IPAccessRule)
    private accessRuleRepo: Repository<IPAccessRule>,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.isEnabled =
      this.configService.get<boolean>('ACCESS_CONTROL_ENABLED') || true;
    this.defaultPolicy =
      this.configService.get<'allow' | 'deny'>(
        'ACCESS_CONTROL_DEFAULT_POLICY',
      ) || 'deny';
    this.emergencyAccessEnabled =
      this.configService.get<boolean>('EMERGENCY_ACCESS_ENABLED') || true;

    // Schedule cleanup of expired rules
    this.scheduleCleanup();
  }

  /**
   * Check if access is allowed for the given IP and user
   */
  async checkAccess(
    ipAddress: string,
    userId?: string,
    userAgent?: string,
    projectId?: string,
    userRoles?: string[],
  ): Promise<AccessCheckResult> {
    if (!this.isEnabled) {
      return { allowed: true, reason: 'Access control disabled' };
    }

    try {
      // Get IP location information
      const location = this.getIPLocation(ipAddress);

      // Check emergency access first
      if (this.emergencyAccessEnabled) {
        const emergencyResult = await this.checkEmergencyAccess(ipAddress);
        if (emergencyResult.allowed) {
          return emergencyResult;
        }
      }

      // Get all active rules
      const rules = await this.getActiveRules();

      // Check rules in priority order
      for (const rule of rules.sort((a, b) => b.priority - a.priority)) {
        const match = this.checkRuleMatch(
          rule,
          ipAddress,
          userId,
          projectId,
          userRoles,
          location || undefined,
        );
        if (match) {
          // Update rule hit count
          await this.updateRuleHitCount(rule.id);

          // Log access attempt
          await this.logAccessAttempt({
            ipAddress,
            userId,
            userAgent,
            timestamp: new Date(),
            allowed:
              rule.ruleType === AccessRuleType.WHITELIST ||
              rule.ruleType === AccessRuleType.GEOGRAPHIC,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            location: location || undefined,
          });

          return {
            allowed:
              rule.ruleType === AccessRuleType.WHITELIST ||
              rule.ruleType === AccessRuleType.GEOGRAPHIC,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            ruleName: rule.name,
            requiresApproval: rule.requiresApproval,
            expiresAt: rule.expiresAt || undefined,
            metadata: rule.metadata || undefined,
          };
        }
      }

      // No rules matched, apply default policy
      const allowed = this.defaultPolicy === 'allow';
      const reason = allowed
        ? 'No rules matched, default allow'
        : 'No rules matched, default deny';

      await this.logAccessAttempt({
        ipAddress,
        userId,
        userAgent,
        timestamp: new Date(),
        allowed,
        reason,
        location: location || undefined,
      });

      return { allowed, reason };
    } catch (error) {
      this.logger.error('Access control check failed', error);

      // On error, apply default policy
      const allowed = this.defaultPolicy === 'allow';
      return {
        allowed,
        reason: `Access control error, default ${this.defaultPolicy}`,
      };
    }
  }

  /**
   * Create a new access rule
   */
  async createRule(ruleData: Partial<IPAccessRule>): Promise<IPAccessRule> {
    const rule = this.accessRuleRepo.create(ruleData);
    const savedRule = await this.accessRuleRepo.save(rule);

    // Log rule creation
    await this.auditService.log({
      eventType: AuditEventType.ACCESS_RULE_CREATED,
      severity: AuditSeverity.MEDIUM,
      description: 'IP access rule created',
      userId: ruleData.createdBy || undefined,
      resourceType: 'access_rule',
      resourceId: savedRule.id,
      details: {
        ruleType: ruleData.ruleType,
        ipAddress: ruleData.ipAddress,
        name: ruleData.name,
      },
    });

    this.logger.log(`Access rule created: ${savedRule.name} (${savedRule.id})`);
    return savedRule;
  }

  /**
   * Update an existing access rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<IPAccessRule>,
  ): Promise<IPAccessRule> {
    const rule = await this.accessRuleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new Error('Rule not found');
    }

    const updatedRule = await this.accessRuleRepo.save({ ...rule, ...updates });

    // Log rule update
    await this.auditService.log({
      eventType: AuditEventType.ACCESS_RULE_UPDATED,
      severity: AuditSeverity.MEDIUM,
      description: 'IP access rule updated',
      userId: updates.createdBy || undefined,
      resourceType: 'access_rule',
      resourceId: ruleId,
      details: {
        changes: updates,
        originalRule: rule,
      },
    });

    this.logger.log(`Access rule updated: ${updatedRule.name} (${ruleId})`);
    return updatedRule;
  }

  /**
   * Delete an access rule
   */
  async deleteRule(ruleId: string, deletedBy?: string): Promise<void> {
    const rule = await this.accessRuleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new Error('Rule not found');
    }

    await this.accessRuleRepo.delete(ruleId);

    // Log rule deletion
    await this.auditService.log({
      eventType: AuditEventType.ACCESS_RULE_DELETED,
      severity: AuditSeverity.MEDIUM,
      description: 'IP access rule deleted',
      userId: deletedBy,
      resourceType: 'access_rule',
      resourceId: ruleId,
      details: {
        ruleName: rule.name,
        ruleType: rule.ruleType,
      },
    });

    this.logger.log(`Access rule deleted: ${rule.name} (${ruleId})`);
  }

  /**
   * Get all access rules
   */
  async getAllRules(): Promise<IPAccessRule[]> {
    return this.accessRuleRepo.find({
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Get active access rules
   */
  async getActiveRules(): Promise<IPAccessRule[]> {
    const now = new Date();
    return this.accessRuleRepo.find({
      where: {
        status: AccessRuleStatus.ACTIVE,
        isActive: true,
        validFrom: LessThan(now),
        validUntil: MoreThan(now),
      },
      order: { priority: 'DESC' },
    });
  }

  /**
   * Get access statistics
   */
  async getAccessStats(): Promise<{
    totalRules: number;
    activeRules: number;
    whitelistRules: number;
    blacklistRules: number;
    geographicRules: number;
    timeBasedRules: number;
    totalHits: number;
    topRules: Array<{ ruleId: string; name: string; hitCount: number }>;
  }> {
    const rules = await this.accessRuleRepo.find();
    const activeRules = rules.filter(
      (r) => r.status === AccessRuleStatus.ACTIVE && r.isActive,
    );

    const stats = {
      totalRules: rules.length,
      activeRules: activeRules.length,
      whitelistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.WHITELIST,
      ).length,
      blacklistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.BLACKLIST,
      ).length,
      geographicRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.GEOGRAPHIC,
      ).length,
      timeBasedRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.TIME_BASED,
      ).length,
      totalHits: rules.reduce((sum, r) => sum + r.hitCount, 0),
      topRules: rules
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 10)
        .map((r) => ({ ruleId: r.id, name: r.name, hitCount: r.hitCount })),
    };

    return stats;
  }

  /**
   * Check if an IP address matches a rule
   */
  private checkRuleMatch(
    rule: IPAccessRule,
    ipAddress: string,
    userId?: string,
    projectId?: string,
    userRoles?: string[],
    location?: IPLocation,
  ): boolean {
    // Check user-specific rules
    if (
      rule.ruleType === AccessRuleType.USER_SPECIFIC &&
      rule.userId !== userId
    ) {
      return false;
    }

    // Check role-based rules
    if (rule.ruleType === AccessRuleType.ROLE_BASED && userRoles) {
      const hasMatchingRole = rule.allowedRoles?.some((role) =>
        userRoles.includes(role),
      );
      if (!hasMatchingRole) {
        return false;
      }
    }

    // Check project-specific rules
    if (rule.allowedProjects && projectId) {
      if (!rule.allowedProjects.includes(projectId)) {
        return false;
      }
    }

    // Check IP address match
    if (
      rule.ruleType === AccessRuleType.WHITELIST ||
      rule.ruleType === AccessRuleType.BLACKLIST
    ) {
      if (
        !this.isIPMatch(
          ipAddress,
          rule.ipAddress,
          rule.ipType,
          rule.endIpAddress || undefined,
        )
      ) {
        return false;
      }
    }

    // Check geographic rules
    if (rule.ruleType === AccessRuleType.GEOGRAPHIC && location) {
      if (rule.country && rule.country !== location.country) {
        return false;
      }
      if (rule.region && rule.region !== location.region) {
        return false;
      }
      if (rule.city && rule.city !== location.city) {
        return false;
      }
    }

    // Check time-based rules
    if (rule.ruleType === AccessRuleType.TIME_BASED) {
      if (!this.isTimeAllowed(rule)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if IP address matches the rule pattern
   */
  private isIPMatch(
    ipAddress: string,
    ruleIP: string,
    ipType: IPType,
    endIP?: string,
  ): boolean {
    switch (ipType) {
      case IPType.SINGLE:
        return ipAddress === ruleIP;

      case IPType.RANGE:
        if (!endIP) return false;
        return this.isIPInRange(ipAddress, ruleIP, endIP);

      case IPType.CIDR:
        return this.isIPInCIDR(ipAddress, ruleIP);

      case IPType.WILDCARD:
        return this.isIPWildcardMatch(ipAddress, ruleIP);

      default:
        return false;
    }
  }

  /**
   * Check if IP is in range
   */
  private isIPInRange(
    ipAddress: string,
    startIP: string,
    endIP: string,
  ): boolean {
    const ip = this.ipToNumber(ipAddress);
    const start = this.ipToNumber(startIP);
    const end = this.ipToNumber(endIP);
    return ip >= start && ip <= end;
  }

  /**
   * Check if IP is in CIDR block
   */
  private isIPInCIDR(ipAddress: string, cidr: string): boolean {
    const [network, prefixLength] = cidr.split('/');
    const ip = this.ipToNumber(ipAddress);
    const networkIP = this.ipToNumber(network);
    const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
    return (ip & mask) === (networkIP & mask);
  }

  /**
   * Check if IP matches wildcard pattern
   */
  private isIPWildcardMatch(ipAddress: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(ipAddress);
  }

  /**
   * Check if current time is allowed by the rule
   */
  private isTimeAllowed(rule: IPAccessRule): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const currentDay = now.getDay();

    // Check time range
    if (rule.allowedStartTime && rule.allowedEndTime) {
      if (
        currentTime < rule.allowedStartTime ||
        currentTime > rule.allowedEndTime
      ) {
        return false;
      }
    }

    // Check allowed days
    if (rule.allowedDays && !rule.allowedDays.includes(currentDay)) {
      return false;
    }

    return true;
  }

  /**
   * Check emergency access
   */
  private async checkEmergencyAccess(
    ipAddress: string,
  ): Promise<AccessCheckResult> {
    const emergencyRules = await this.accessRuleRepo.find({
      where: {
        ruleType: AccessRuleType.WHITELIST,
        isEmergency: true,
        status: AccessRuleStatus.ACTIVE,
        isActive: true,
      },
    });

    for (const rule of emergencyRules) {
      if (
        this.isIPMatch(
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

  /**
   * Get IP location information
   */
  private getIPLocation(ipAddress: string): IPLocation | null {
    try {
      const geo = geoip.lookup(ipAddress);
      if (!geo) return null;

      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        latitude: geo.ll[0],
        longitude: geo.ll[1],
      };
    } catch (error) {
      this.logger.warn(`Failed to get location for IP ${ipAddress}`, error);
      return null;
    }
  }

  /**
   * Convert IP address to number
   */
  private ipToNumber(ip: string): number {
    return (
      ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>>
      0
    );
  }

  /**
   * Update rule hit count
   */
  private async updateRuleHitCount(ruleId: string): Promise<void> {
    await this.accessRuleRepo.increment({ id: ruleId }, 'hitCount', 1);
    await this.accessRuleRepo.update(ruleId, { lastHitAt: new Date() });
  }

  /**
   * Log access attempt
   */
  private async logAccessAttempt(attempt: AccessAttempt): Promise<void> {
    try {
      await this.auditService.log({
        eventType: attempt.allowed
          ? AuditEventType.ACCESS_GRANTED
          : AuditEventType.ACCESS_DENIED,
        severity: attempt.allowed ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
        description: attempt.allowed ? 'Access granted' : 'Access denied',
        userId: attempt.userId,
        resourceType: 'access_control',
        resourceId: attempt.ruleId,
        ipAddress: attempt.ipAddress,
        userAgent: attempt.userAgent,
        details: {
          reason: attempt.reason,
          location: attempt.location,
          timestamp: attempt.timestamp,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log access attempt', error);
    }
  }

  /**
   * Schedule cleanup of expired rules
   */
  private scheduleCleanup(): void {
    // Run cleanup every hour
    cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredRules();
    });
  }

  /**
   * Clean up expired rules
   */
  private async cleanupExpiredRules(): Promise<void> {
    const now = new Date();
    const expiredRules = await this.accessRuleRepo.find({
      where: {
        status: AccessRuleStatus.ACTIVE,
        expiresAt: LessThan(now),
      },
    });

    for (const rule of expiredRules) {
      await this.accessRuleRepo.update(rule.id, {
        status: AccessRuleStatus.EXPIRED,
        isActive: false,
      });
    }

    if (expiredRules.length > 0) {
      this.logger.log(`Cleaned up ${expiredRules.length} expired access rules`);
    }
  }
}
