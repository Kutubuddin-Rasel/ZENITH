// src/attachments/dto/attachment.dto.ts
import { IsUUID } from 'class-validator';

export class DeleteAttachmentDto {
  @IsUUID()
  attachmentId: string;
}
