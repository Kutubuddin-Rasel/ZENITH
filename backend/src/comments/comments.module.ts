// src/comments/comments.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module';
import { WatchersModule } from '../watchers/watchers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    forwardRef(() => IssuesModule),
    forwardRef(() => MembershipModule),
    forwardRef(() => WatchersModule),
  ],
  providers: [CommentsService],
  controllers: [CommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
