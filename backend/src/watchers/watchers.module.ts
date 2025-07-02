// src/watchers/watchers.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watcher } from './entities/watcher.entity';
import { WatchersService } from './watchers.service';
import { WatchersController } from './watchers.controller';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsEmitter } from './events/notifications.events';
import { NotificationsModule } from '../notifications/notifications.module';
import { WatchersListener } from './watchers.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Watcher]),
    forwardRef(() => ProjectsModule),
    forwardRef(() => IssuesModule),
    MembershipModule,
    EventEmitterModule.forRoot(),
    forwardRef(() => NotificationsModule),
  ],
  providers: [WatchersService, NotificationsEmitter, WatchersListener],
  controllers: [WatchersController],
  exports: [WatchersService],
})
export class WatchersModule {}
