// src/attachments/config/attachment-upload.interceptor.ts
//
// Single source of truth for the attachment upload pipeline. The legacy
// controller inlined this identical `diskStorage` + filter + limits block FIVE
// times (one per target) — any divergence (a raised size cap, a new MIME rule)
// silently applied to only some endpoints. Centralizing it makes the upload
// contract uniform and the controller declarative.
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { attachmentFileFilter } from './file-filter.config';
import { safeFilenameCallback } from './filename-sanitizer.config';

/** Max accepted upload size (bytes). */
export const ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * The shared `FileInterceptor` mixin for every attachment upload endpoint.
 * Returns a fresh interceptor class per call (NestJS treats each as a distinct
 * mixin); the underlying options object is the single shared contract.
 */
export const attachmentUploadInterceptor = () =>
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: safeFilenameCallback,
    }),
    fileFilter: attachmentFileFilter,
    limits: { fileSize: ATTACHMENT_MAX_FILE_SIZE },
  });
