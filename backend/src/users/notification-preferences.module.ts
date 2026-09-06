import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationPreferencesRepository } from './repositories/abstract/notification-preferences.repository.abstract';
import { PostgresNotificationPreferencesRepository } from './repositories/concrete/postgres-notification-preferences.repository';

/**
 * Step 6 — Notification preferences extracted into their own module so that
 * `UsersModule` can lock its public surface down to the four segregated ISP
 * tokens. The notification-preference slice has its own bounded context
 * (email opt-in flags keyed by userId) and now exposes itself directly to
 * the consumers that need it (currently `AuthModule.UserSecurityController`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference])],
  providers: [
    NotificationPreferencesService,
    {
      provide: NotificationPreferencesRepository,
      useClass: PostgresNotificationPreferencesRepository,
    },
  ],
  exports: [NotificationPreferencesService, NotificationPreferencesRepository],
})
export class NotificationPreferencesModule {}
