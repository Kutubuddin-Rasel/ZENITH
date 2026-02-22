/**
 * Generate Project from Text — Input DTO
 *
 * WHY CLASS-VALIDATOR (not Zod)?
 * ─────────────────────────────
 * This DTO validates the HTTP request body via NestJS's ValidationPipe.
 * Class-validator decorators integrate seamlessly with NestJS's DI pipeline:
 * the framework instantiates the class via class-transformer, then validates
 * it via class-validator — all before the controller method executes.
 *
 * Zod is used separately for the LLM output (see generated-project.schema.ts)
 * because that's an untrusted JSON blob parsed in a BullMQ processor, outside
 * the NestJS HTTP pipeline.
 */

import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateProjectFromTextDto {
  /**
   * Raw unstructured text to parse into a project.
   * Examples: client email, Upwork brief, brainstorm notes.
   *
   * SECURITY: @MaxLength(10000) prevents:
   *   1. Malicious 5MB payloads exhausting LLM context window
   *   2. Token abuse (10,000 chars ≈ 2,500 tokens — well within limits)
   *   3. Redis/BullMQ memory bloat from oversized job payloads
   *
   * @Transform(trim) per security-validate-all-input rule:
   *   Prevents whitespace-only payloads bypassing @IsNotEmpty
   */
  @IsString()
  @IsNotEmpty({ message: 'Raw text is required' })
  @MaxLength(10000, {
    message: 'Text must not exceed 10,000 characters (~2,500 tokens)',
  })
  @Transform(({ value }: { value: string }) => value?.trim())
  rawText: string;

  /**
   * Optional hint for the LLM about desired project methodology.
   * If provided, the LLM will prefer this methodology in its output.
   * If omitted, the LLM infers the best fit from the text.
   *
   * Valid values: 'agile' | 'scrum' | 'kanban' | 'waterfall' | 'hybrid' | 'lean'
   * (Validated by Zod on the LLM output side, not here — this is just a hint)
   */
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Methodology hint must not exceed 20 characters' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  methodologyHint?: string;
}

/**
 * Typed job data interface for BullMQ project-generation queue.
 *
 * Per micro-use-queues best practice: typed job data prevents
 * `any` leaking into @InjectQueue().add() and @Processor handlers.
 *
 * Server-injected fields (from JWT, NOT from user input):
 *   - userId: authenticated user who triggered generation
 *   - organizationId: tenant isolation scope
 */
export interface ProjectGenerationJobData {
  /** Sanitized raw text (already trimmed by DTO) */
  rawText: string;

  /** Optional methodology hint from user */
  methodologyHint?: string;

  /** Authenticated user ID (from JWT) */
  userId: string;

  /** Organization ID for tenant isolation (from JWT) */
  organizationId: string;
}
