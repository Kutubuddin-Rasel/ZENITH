// src/comments/comments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { WatchersModule } from '../watchers/watchers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    // REFACTORED: Direct imports since cycles are broken
    IssuesModule,
    WatchersModule,
  ],
  providers: [CommentsService],
  controllers: [CommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
