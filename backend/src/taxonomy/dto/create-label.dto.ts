// src/taxonomy/dto/create-label.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * CreateLabelDto - Label creation validation
 *
 * SECURITY (Phase 2): Prevents UX DoS via:
 * - MaxLength(100): Prevents layout-breaking long names
 * - Trim: Normalizes whitespace to prevent duplicates
 */
export class CreateLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;
}
