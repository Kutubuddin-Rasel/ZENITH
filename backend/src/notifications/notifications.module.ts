// src/notifications/notifications.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { WatchersModule } from '../watchers/watchers.module';
import { UsersModule } from '../users/users.module';
import { NotificationsGateway } from './notifications.gateway';
import { MembershipModule } from '../membership/membership.module';
import { NotificationsListener } from './notifications.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    forwardRef(() => WatchersModule),
    forwardRef(() => UsersModule),
    MembershipModule,
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationsListener,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
