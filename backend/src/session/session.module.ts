import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SessionController } from './session.controller';
import { SessionInterceptor } from './interceptors/session.interceptor';
import { Session } from './entities/session.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { MembershipModule } from '../membership/membership.module';

// SOLID Refactor: DIP token seam (Steps 1–3).
import {
  SESSION_STORE_TOKEN,
  SESSION_USER_LOOKUP_TOKEN,
  SESSION_CONFIG_TOKEN,
  SESSION_AUDITOR_TOKEN,
  SESSION_DEVICE_PARSER_TOKEN,
  SESSION_QUERY_TOKEN,
  SESSION_COMMAND_TOKEN,
  SESSION_LIFECYCLE_TOKEN,
  SESSION_SECURITY_TOKEN,
} from './constants/session.tokens';
import { PostgresSessionStoreRepository } from './repositories/postgres/postgres-session-store.repository';
import { PostgresSessionUserLookupRepository } from './repositories/postgres/postgres-session-user-lookup.repository';
import { SessionConfig } from './config/session.config';
import { SessionAuditorService } from './services/session-auditor.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { SessionQueryService } from './services/session-query.service';
import { SessionCommandService } from './services/session-command.service';
import { SessionLifecycleService } from './services/session-lifecycle.service';
import { SessionSecurityService } from './services/session-security.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User]),
    ConfigModule,
    AuditModule,
    MembershipModule,
  ],
  providers: [
    SessionInterceptor,
    // --- Infrastructure ports (TypeORM / Config / Audit / device) ---
    { provide: SESSION_STORE_TOKEN, useClass: PostgresSessionStoreRepository },
    {
      provide: SESSION_USER_LOOKUP_TOKEN,
      useClass: PostgresSessionUserLookupRepository,
    },
    { provide: SESSION_CONFIG_TOKEN, useClass: SessionConfig },
    { provide: SESSION_AUDITOR_TOKEN, useClass: SessionAuditorService },
    {
      provide: SESSION_DEVICE_PARSER_TOKEN,
      useClass: DeviceFingerprintService,
    },
    // --- Application ports (role-segregated SRP services) ---
    { provide: SESSION_QUERY_TOKEN, useClass: SessionQueryService },
    { provide: SESSION_COMMAND_TOKEN, useClass: SessionCommandService },
    { provide: SESSION_LIFECYCLE_TOKEN, useClass: SessionLifecycleService },
    { provide: SESSION_SECURITY_TOKEN, useClass: SessionSecurityService },
  ],
  controllers: [SessionController],
  exports: [
    SessionInterceptor,
    SESSION_QUERY_TOKEN,
    SESSION_COMMAND_TOKEN,
    SESSION_LIFECYCLE_TOKEN,
    SESSION_SECURITY_TOKEN,
  ],
})
export class SessionModule {}
