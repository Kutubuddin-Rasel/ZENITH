import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserSession } from '../entities/user-session.entity';
import { SessionPolicy } from '../entities/session-policy.entity';
import { LoginHistory } from '../login-history/entities/login-history.entity';

import { SessionsService } from '../sessions.service';
import { SessionsController } from '../sessions.controller';

import { SessionPreferencesService } from '../services/users/session-preferences.service';
import { LoginHistoryService } from '../login-history/login-history.service';
import { LoginHistoryController } from '../login-history/login-history.controller';

import { UserSessionRepository } from '../repositories/abstract/user-session.repository.abstract';
import { PostgresUserSessionRepository } from '../repositories/concrete/postgres-user-session.repository';
import { SessionPreferencesRepository } from '../repositories/abstract/session-preferences.repository.abstract';
import { PostgresSessionPreferencesRepository } from '../repositories/concrete/postgres-session-preferences.repository';
import { LoginHistoryRepository } from '../repositories/abstract/login-history.repository.abstract';
import { PostgresLoginHistoryRepository } from '../repositories/concrete/postgres-login-history.repository';

/**
 * Step 5 — Sessions sub-module.
 *
 * Owns the long-lived session/activity slice of the auth domain:
 *   - active session lifecycle (UserSession)
 *   - per-user session policy (SessionPolicy)
 *   - login attempt history (LoginHistory)
 *
 * Re-exports the concrete services because auth-core's
 * {@link UserPasswordService}, {@link UserLifecycleService} and
 * {@link LoginCoordinator} consume them for cross-cutting session
 * revocation. Tokens are not relevant here — these are leaf services
 * with stable repository-bound contracts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserSession, SessionPolicy, LoginHistory]),
  ],
  providers: [
    SessionsService,
    SessionPreferencesService,
    LoginHistoryService,
    { provide: UserSessionRepository, useClass: PostgresUserSessionRepository },
    {
      provide: SessionPreferencesRepository,
      useClass: PostgresSessionPreferencesRepository,
    },
    {
      provide: LoginHistoryRepository,
      useClass: PostgresLoginHistoryRepository,
    },
  ],
  controllers: [SessionsController, LoginHistoryController],
  exports: [
    SessionsService,
    SessionPreferencesService,
    LoginHistoryService,
    UserSessionRepository,
    SessionPreferencesRepository,
    LoginHistoryRepository,
  ],
})
export class SessionsModule {}
