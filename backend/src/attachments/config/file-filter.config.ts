// src/attachments/config/file-filter.config.ts
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { Request } from 'express';

/**
 * SECURITY: Strict MIME Type Whitelist
 * 
 * LAYER 1 of defense: Blocks dangerous file types at upload.
 * NOTE: This checks client-provided MIME type only.
 * Phase 5 (Magic Numbers) validates actual file content bytes.
 * 
 * RISK: SVG can contain <script> - sanitize before inline serving.
 */
export const ALLOWED_MIME_TYPES = new Set<string>([
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml', // WARNING: Can contain <script>, sanitize before serving

    // Documents
    'application/pdf',
    'text/plain',
    'text/csv',

    // Microsoft Office - Legacy formats
    'application/msword', // .doc
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-powerpoint', // .ppt

    // Microsoft Office - Modern OpenXML formats
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

    // Archives
    'application/zip',
    'application/x-zip-compressed',
]);

/**
 * Multer fileFilter callback for attachment uploads
 * 
 * @returns true if MIME type is allowed, throws 415 otherwise
 */
export const attachmentFileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
): void => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new UnsupportedMediaTypeException(
                `File type '${file.mimetype}' is not allowed. Allowed types: images (jpeg, png, gif, webp, svg), documents (pdf, txt, csv), office files (doc/docx, xls/xlsx, ppt/pptx), and archives (zip).`,
            ),
            false,
        );
    }
};
