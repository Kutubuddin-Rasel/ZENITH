// src/watchers/watchers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Watcher } from './entities/watcher.entity';
import { WatchersService } from './watchers.service';
import { WatchersController } from './watchers.controller';
// REMOVED: ProjectsModule import - using CoreEntitiesModule (global)
// REMOVED: IssuesModule import - WatchersService uses direct Issue repo from CoreEntitiesModule
// REMOVED: MembershipModule import - using ProjectCoreModule (global)
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsEmitter } from './events/notifications.events';
// REMOVED: NotificationsModule - using event-driven architecture instead
import { WatchersListener } from './watchers.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Watcher]),
    // REFACTORED: All forwardRefs eliminated - using global core modules and events
    EventEmitterModule.forRoot(),
  ],
  providers: [WatchersService, NotificationsEmitter, WatchersListener],
  controllers: [WatchersController],
  exports: [WatchersService],
})
export class WatchersModule { }
