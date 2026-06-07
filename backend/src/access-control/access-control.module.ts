import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AccessControlController } from './access-control.controller';
import { AccessControlGuard } from './guards/access-control.guard';
import { IpResolutionService } from './services/ip-resolution.service';
import { IPAccessRule } from './entities/ip-access-rule.entity';
import { AccessRuleHistory } from './entities/access-rule-history.entity';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../cache/cache.module';

import {
  ACCESS_ATTEMPT_AUDITOR_TOKEN,
  ACCESS_CHECKER_TOKEN,
  ACCESS_CONTROL_CONFIG_TOKEN,
  ACCESS_RULE_AUDITOR_TOKEN,
  ACCESS_RULE_CACHE_TOKEN,
  ACCESS_RULE_COMMAND_TOKEN,
  ACCESS_RULE_HISTORY_REPOSITORY_TOKEN,
  ACCESS_RULE_HISTORY_TOKEN,
  ACCESS_RULE_QUERY_TOKEN,
  ACCESS_RULE_REPOSITORY_TOKEN,
  ACCESS_STATS_TOKEN,
  CLIENT_IP_RESOLVER_TOKEN,
  EMERGENCY_ACCESS_TOKEN,
  GEO_IP_TOKEN,
} from './constants/access-control.tokens';
import {
  IAccessAttemptAuditor,
  IAccessChecker,
  IAccessControlConfig,
  IAccessRuleAuditor,
  IAccessRuleCache,
  IAccessRuleCommand,
  IAccessRuleHistory,
  IAccessRuleQuery,
  IAccessStats,
  IClientIpResolver,
  IEmergencyAccess,
  IGeoIpLookup,
} from './interfaces/access-control.interfaces';
import { AccessRuleRepository } from './repositories/abstract/access-rule.repository';
import { AccessRuleHistoryRepository } from './repositories/abstract/access-rule-history.repository';
import { PostgresAccessRuleRepository } from './repositories/postgres/postgres-access-rule.repository';
import { PostgresAccessRuleHistoryRepository } from './repositories/postgres/postgres-access-rule-history.repository';
import { AccessControlConfigService } from './config/access-control-config.service';
import { GeoIpService } from './services/geo-ip.service';
import { AccessAttemptAuditService } from './services/access-attempt-audit.service';
import { AccessRuleHistoryService } from './services/access-rule-history.service';
import { AccessRuleL1Cache } from './services/access-rule-l1-cache';
import { AccessRuleCacheService } from './services/access-rule-cache.service';
import { AccessRuleCacheInvalidatorService } from './services/access-rule-cache-invalidator.service';
import { EmergencyAccessService } from './services/emergency-access.service';
import { AccessCheckerService } from './services/access-checker.service';
import { AccessRuleCommandService } from './services/access-rule-command.service';
import { AccessRuleQueryService } from './services/access-rule-query.service';
import { AccessStatsService } from './services/access-stats.service';
import { AccessRuleCleanupService } from './services/access-rule-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IPAccessRule, AccessRuleHistory]),
    ConfigModule,
    AuditModule,
    CacheModule,
    EventEmitterModule.forRoot(), // For cache invalidation events
  ],
  providers: [
    // Concrete implementations
    AccessControlConfigService,
    PostgresAccessRuleRepository,
    PostgresAccessRuleHistoryRepository,
    GeoIpService,
    IpResolutionService,
    AccessAttemptAuditService,
    AccessRuleHistoryService,
    AccessRuleL1Cache,
    AccessRuleCacheService,
    AccessRuleCacheInvalidatorService,
    EmergencyAccessService,
    AccessCheckerService,
    AccessRuleCommandService,
    AccessRuleQueryService,
    AccessStatsService,
    AccessRuleCleanupService,
    AccessControlGuard,

    // Double-binding: token + abstract class → same singleton
    {
      provide: ACCESS_CONTROL_CONFIG_TOKEN,
      useExisting: AccessControlConfigService,
    },
    { provide: IAccessControlConfig, useExisting: AccessControlConfigService },

    {
      provide: ACCESS_RULE_REPOSITORY_TOKEN,
      useExisting: PostgresAccessRuleRepository,
    },
    {
      provide: AccessRuleRepository,
      useExisting: PostgresAccessRuleRepository,
    },

    {
      provide: ACCESS_RULE_HISTORY_REPOSITORY_TOKEN,
      useExisting: PostgresAccessRuleHistoryRepository,
    },
    {
      provide: AccessRuleHistoryRepository,
      useExisting: PostgresAccessRuleHistoryRepository,
    },

    { provide: GEO_IP_TOKEN, useExisting: GeoIpService },
    { provide: IGeoIpLookup, useExisting: GeoIpService },

    { provide: CLIENT_IP_RESOLVER_TOKEN, useExisting: IpResolutionService },
    { provide: IClientIpResolver, useExisting: IpResolutionService },

    {
      provide: ACCESS_ATTEMPT_AUDITOR_TOKEN,
      useExisting: AccessAttemptAuditService,
    },
    { provide: IAccessAttemptAuditor, useExisting: AccessAttemptAuditService },

    {
      provide: ACCESS_RULE_AUDITOR_TOKEN,
      useExisting: AccessAttemptAuditService,
    },
    { provide: IAccessRuleAuditor, useExisting: AccessAttemptAuditService },

    {
      provide: ACCESS_RULE_HISTORY_TOKEN,
      useExisting: AccessRuleHistoryService,
    },
    { provide: IAccessRuleHistory, useExisting: AccessRuleHistoryService },

    { provide: ACCESS_RULE_CACHE_TOKEN, useExisting: AccessRuleCacheService },
    { provide: IAccessRuleCache, useExisting: AccessRuleCacheService },

    { provide: EMERGENCY_ACCESS_TOKEN, useExisting: EmergencyAccessService },
    { provide: IEmergencyAccess, useExisting: EmergencyAccessService },

    { provide: ACCESS_CHECKER_TOKEN, useExisting: AccessCheckerService },
    { provide: IAccessChecker, useExisting: AccessCheckerService },

    {
      provide: ACCESS_RULE_COMMAND_TOKEN,
      useExisting: AccessRuleCommandService,
    },
    { provide: IAccessRuleCommand, useExisting: AccessRuleCommandService },

    { provide: ACCESS_RULE_QUERY_TOKEN, useExisting: AccessRuleQueryService },
    { provide: IAccessRuleQuery, useExisting: AccessRuleQueryService },

    { provide: ACCESS_STATS_TOKEN, useExisting: AccessStatsService },
    { provide: IAccessStats, useExisting: AccessStatsService },
  ],
  controllers: [AccessControlController],
  exports: [
    // Internal re-exports for sibling-module providers. The public surface is
    // the index.ts barrel (Step 3). Only tokens + abstractions are exported —
    // never concrete service classes.
    ACCESS_CHECKER_TOKEN,
    IAccessChecker,
    CLIENT_IP_RESOLVER_TOKEN,
    IClientIpResolver,
    AccessControlGuard,
  ],
})
export class AccessControlModule {}
