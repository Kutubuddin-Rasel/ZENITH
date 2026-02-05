// src/attachments/attachments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentHistory } from './entities/attachment-history.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { VirusScanningService } from './services/virus-scanning.service';
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { SprintsModule } from '../sprints/sprints.module';
import { CommentsModule } from '../comments/comments.module';
import { ReleasesModule } from '../releases/releases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment, AttachmentHistory]),
    // REFACTORED: Direct imports since cycles are broken
    IssuesModule,
    SprintsModule,
    CommentsModule,
    ReleasesModule,
  ],
  providers: [AttachmentsService, VirusScanningService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService],
})
export class AttachmentsModule { }

