import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { BullModule } from '@nestjs/bullmq';
import { BriefingService } from './services/briefing.service';
import { DailyDigestProcessor } from './processors/daily-digest.processor';
import { NotificationsConsumer } from './processors/notifications.consumer';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { NotificationsGateway } from './notifications.gateway';
import { MembershipModule } from '../membership/membership.module';
import { NotificationsListener } from './notifications.listener';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { SmartDigestService } from './services/smart-digest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    ConfigModule,
    CacheModule,
    BullModule.registerQueue({
      name: 'notifications',
    }),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    MembershipModule,
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
    BriefingService,
    SmartDigestService,
    DailyDigestProcessor,
    NotificationsConsumer,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, SmartDigestService],
})
export class NotificationsModule {}
