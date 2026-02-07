// src/taxonomy/dto/create-component.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * CreateComponentDto - Component creation validation
 *
 * SECURITY (Phase 2): Prevents UX DoS via:
 * - MaxLength(100): Prevents layout-breaking long names
 * - Trim: Normalizes whitespace to prevent duplicates
 */
export class CreateComponentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;
}
