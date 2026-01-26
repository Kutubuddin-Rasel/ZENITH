import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { BriefingService } from './services/briefing.service';
import { DailyDigestProcessor } from './processors/daily-digest.processor';
import { NotificationsConsumer } from './processors/notifications.consumer';
import { ConfigModule } from '@nestjs/config';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
import { NotificationsGateway } from './notifications.gateway';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { NotificationsListener } from './notifications.listener';
// REMOVED: AuthModule - guards are global via APP_GUARD
import { CacheModule } from '../cache/cache.module';
import { SmartDigestService } from './services/smart-digest.service';
import { SnoozeWorker } from './processors/snooze.worker';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ConfigModule,
    CacheModule,
    ScheduleModule.forRoot(),
    // Queue registration now in CoreQueueModule (global)
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
    BriefingService,
    SmartDigestService,
    DailyDigestProcessor,
    NotificationsConsumer,
    SnoozeWorker,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, SmartDigestService],
})
export class NotificationsModule {}
