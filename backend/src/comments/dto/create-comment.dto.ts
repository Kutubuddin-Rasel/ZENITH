// src/comments/dto/create-comment.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SanitizeHtml } from '../../common/decorators/safe-transform.decorators';

/**
 * SECURITY: Content is sanitized and length-limited
 * - Trim: Removes leading/trailing whitespace
 * - XSS: Strips dangerous HTML (script, iframe, javascript:)
 * - DoS: Max 10,000 characters
 */
export class CreateCommentDto {
  // TRANSFORM ORDER: trim → sanitize → validate
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @SanitizeHtml({
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'p', 'br'],
    allowedAttributes: {
      a: ['href', 'target'],
    },
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(10000, { message: 'Comment cannot exceed 10,000 characters' })
  content: string;
}
