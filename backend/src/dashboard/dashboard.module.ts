import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Enable caching for this module - uses the global Redis cache
    CacheModule.register(),
    IssuesModule,
    SprintsModule,
    NotificationsModule,
    ProjectsModule,
    UsersModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
