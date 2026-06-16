// src/attachments/attachments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentHistory } from './entities/attachment-history.entity';
import { AttachmentsController } from './attachments.controller';
import { VirusScanningService } from './services/virus-scanning.service';
import { StorageModule } from './storage/storage.module';
import { TypeormAttachmentRepository } from './repositories/typeorm-attachment.repository';
import { AttachmentTargetRegistry } from './services/attachment-target.registry';
import { AttachmentQueryService } from './services/attachment-query.service';
import { AttachmentCommandService } from './services/attachment-command.service';
import {
  ATTACHMENT_COMMAND_TOKEN,
  ATTACHMENT_QUERY_TOKEN,
  ATTACHMENT_REPOSITORY_TOKEN,
} from './constants/attachments.tokens';
import { IssuesModule } from '../issues/issues.module';
import { SprintsModule } from '../sprints/sprints.module';
import { CommentsModule } from '../comments/comments.module';
import { ReleasesModule } from '../releases/releases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment, AttachmentHistory]),
    // Live storage seam: was 100% orphaned — now the FILE_STORAGE_PROVIDER port
    // actually resolves (Local / S3 / Cloudinary per STORAGE_PROVIDER env).
    StorageModule.forRoot(),
    // Parent aggregates consumed via their domain query tokens (DIP), not concretes.
    IssuesModule,
    SprintsModule,
    CommentsModule,
    ReleasesModule,
  ],
  providers: [
    VirusScanningService,
    // Persistence port (DIP) — the only holder of Repository<Attachment>.
    {
      provide: ATTACHMENT_REPOSITORY_TOKEN,
      useClass: TypeormAttachmentRepository,
    },
    // O(1) target strategy dispatch.
    AttachmentTargetRegistry,
    // CQRS read / write sides, exposed via ISP tokens.
    AttachmentQueryService,
    { provide: ATTACHMENT_QUERY_TOKEN, useExisting: AttachmentQueryService },
    AttachmentCommandService,
    {
      provide: ATTACHMENT_COMMAND_TOKEN,
      useExisting: AttachmentCommandService,
    },
  ],
  controllers: [AttachmentsController],
  // SEALED: the god class is gone. Attachments is a leaf (0 external consumers);
  // the CQRS ports are exposed only for future cross-module reuse via the barrel.
  exports: [ATTACHMENT_QUERY_TOKEN, ATTACHMENT_COMMAND_TOKEN],
})
export class AttachmentsModule {}
