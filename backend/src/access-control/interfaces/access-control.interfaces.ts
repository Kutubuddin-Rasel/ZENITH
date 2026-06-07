import type {
  IPAccessRule,
  AccessRuleType,
  AccessRuleStatus,
} from '../entities/ip-access-rule.entity';
import type {
  AccessRuleHistory,
  HistoryAction,
} from '../entities/access-rule-history.entity';
import type { Request } from 'express';

// --- Value types ------------------------------------------------------------
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
  organizationId?: string;
}

export interface HistoryContext {
  actorId?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  reason?: string;
}

export interface CacheCounters {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  dbQueries: number;
}

/** Rich cache-stats shape; preserves the legacy getCacheStats() output. */
export interface CacheStatsSnapshot {
  l1: { size: number; maxSize: number };
  stats: CacheCounters;
  hitRates: { l1: string; l2: string };
}

/**
 * Tenant-scoping context for write operations. Mirrors the security gate
 * carried by the legacy createRule/updateRule/deleteRule signatures
 * (creatorOrganizationId + isSuperAdmin), now sourced from req.user.
 */
export interface TenantScope {
  organizationId?: string;
  isSuperAdmin: boolean;
}

export type AccessRuleCreateCommand = Partial<IPAccessRule> & {
  createdBy: string;
};
export type AccessRuleUpdateCommand = Partial<IPAccessRule> & {
  createdBy?: string;
};

export interface BuildHistoryEntryParams {
  action: HistoryAction;
  rule: IPAccessRule;
  before?: IPAccessRule;
  changedFields?: string[] | null;
  ctx?: HistoryContext;
  fallbackActorId?: string | null;
}

export interface RuleAuditEvent {
  action: 'created' | 'updated' | 'deleted';
  rule: IPAccessRule;
  actorId?: string;
  changes?: Partial<IPAccessRule>;
  changedFields?: string[];
}

// --- Ports ------------------------------------------------------------------
export abstract class IAccessChecker {
  abstract checkAccess(
    ipAddress: string,
    userId?: string,
    userAgent?: string,
    projectId?: string,
    userRoles?: string[],
    organizationId?: string,
  ): Promise<AccessCheckResult>;
}

export abstract class IAccessRuleCommand {
  abstract create(
    cmd: AccessRuleCreateCommand,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<IPAccessRule>;
  abstract update(
    id: string,
    cmd: AccessRuleUpdateCommand,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<IPAccessRule>;
  abstract delete(
    id: string,
    actorId: string,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<void>;
}

export abstract class IAccessRuleQuery {
  abstract findActive(organizationId?: string): Promise<IPAccessRule[]>;
  abstract findAll(filters?: {
    type?: AccessRuleType;
    status?: AccessRuleStatus;
    organizationId?: string;
  }): Promise<IPAccessRule[]>;
  abstract findById(id: string): Promise<IPAccessRule | null>;
}

export abstract class IAccessRuleCache {
  abstract getMergedRules(organizationId?: string): Promise<IPAccessRule[]>;
  abstract getEmergencyRules(organizationId?: string): Promise<IPAccessRule[]>;
  abstract getStats(): CacheStatsSnapshot;
  abstract clear(): void;
}

export abstract class IAccessRuleHistory {
  abstract buildEntry(
    params: BuildHistoryEntryParams,
  ): Partial<AccessRuleHistory>;
  abstract getRuleHistory(
    ruleId: string,
    limit?: number,
  ): Promise<AccessRuleHistory[]>;
  abstract getOrganizationHistory(
    organizationId: string,
    limit?: number,
  ): Promise<AccessRuleHistory[]>;
}

export abstract class IEmergencyAccess {
  abstract check(
    ipAddress: string,
    organizationId?: string,
  ): Promise<AccessCheckResult>;
}

export abstract class IGeoIpLookup {
  abstract lookup(ipAddress: string): IPLocation | null;
}

export abstract class IAccessAttemptAuditor {
  abstract record(attempt: AccessAttempt): Promise<void>;
}

export abstract class IAccessRuleAuditor {
  abstract recordRuleChange(event: RuleAuditEvent): Promise<void>;
}

export abstract class IClientIpResolver {
  abstract getClientIp(request: Request): string;
  abstract isIpInAllowlist(
    ip: string,
    allowlist: string[] | null | undefined,
  ): boolean;
}

export abstract class IAccessControlConfig {
  abstract readonly isEnabled: boolean;
  abstract readonly defaultPolicy: 'allow' | 'deny';
  abstract readonly emergencyAccessEnabled: boolean;
}

export abstract class IAccessStats {
  abstract getAccessStats(
    organizationId?: string,
  ): Promise<Record<string, unknown>>;
}
