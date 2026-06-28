// src/comments/comments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { CommentsController } from './comments.controller';
import { IssuesModule } from '../issues/issues.module';
import { WatchersModule } from '../watchers/watchers.module';
import { WatchersService } from '../watchers/watchers.service';
import {
  COMMENT_REPOSITORY_TOKEN,
  COMMENT_QUERY_TOKEN,
  COMMENT_COMMAND_TOKEN,
} from './constants/comments.tokens';
import { TypeormCommentRepository } from './repositories/postgres/typeorm-comment.repository';
import { CommentQueryService } from './services/comment-query.service';
import { CommentCommandService } from './services/comment-command.service';
import { CommentNotificationPort } from './ports/comment-notification.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    // REFACTORED: Direct imports since cycles are broken
    IssuesModule,
    WatchersModule,
  ],
  providers: [
    // Step 1: persistence inverted behind ICommentRepository.
    { provide: COMMENT_REPOSITORY_TOKEN, useClass: TypeormCommentRepository },
    // Step 2: CQRS read/write services bound to ISP tokens.
    CommentQueryService,
    { provide: COMMENT_QUERY_TOKEN, useExisting: CommentQueryService },
    CommentCommandService,
    { provide: COMMENT_COMMAND_TOKEN, useExisting: CommentCommandService },
    // Outbound notification port → existing WatchersService adapter.
    // (AuditPort is @Global via AuditLogsModule — injected directly, not bound here.)
    { provide: CommentNotificationPort, useExisting: WatchersService },
  ],
  controllers: [CommentsController],
  // Step 3: god class deleted — only the ISP tokens cross the boundary now.
  exports: [COMMENT_QUERY_TOKEN, COMMENT_COMMAND_TOKEN],
})
export class CommentsModule {}
