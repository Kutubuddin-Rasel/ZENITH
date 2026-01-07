/**
 * Scheduled Tasks Module
 *
 * Contains cron jobs and scheduled background tasks.
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProjectPurgeCronService } from './project-purge.cron';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ProjectPurgeCronService],
  exports: [ProjectPurgeCronService],
})
export class ScheduledTasksModule {}
