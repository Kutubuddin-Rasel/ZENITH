// src/backlog/backlog.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { BacklogService } from './backlog.service';
import { BacklogController } from './backlog.controller';
import { Issue } from '../issues/entities/issue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue]),
    // REFACTORED: Direct import since cycles are broken
    IssuesModule,
  ],
  providers: [BacklogService],
  controllers: [BacklogController],
})
export class BacklogModule {}
