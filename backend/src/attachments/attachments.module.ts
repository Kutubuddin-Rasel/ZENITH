// src/attachments/attachments.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module';
import { EpicsModule } from '../epics/epics.module';
import { SprintsModule } from '../sprints/sprints.module';
import { CommentsModule } from '../comments/comments.module';
import { ReleasesModule } from '../releases/releases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment]),
    forwardRef(() => IssuesModule),
    forwardRef(() => MembershipModule),
    forwardRef(() => EpicsModule),
    forwardRef(() => SprintsModule),
    forwardRef(() => CommentsModule),
    forwardRef(() => ReleasesModule),
  ],
  providers: [AttachmentsService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
