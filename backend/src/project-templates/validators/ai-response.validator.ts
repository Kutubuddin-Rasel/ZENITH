/**
 * AI Response Validator
 *
 * Anti-Corruption Layer for AI-generated data.
 * Validates AI output before it touches domain entities.
 * Prevents garbage AI data from corrupting the database.
 */

import { Injectable, Logger } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsString, IsOptional, IsIn, IsArray } from 'class-validator';
import {
  INDUSTRY_VALUES,
  COMPLEXITY_VALUES,
  TEAM_SIZE_VALUES,
  TIMELINE_VALUES,
} from '../dto/wizard-input.dto';
import { ProjectMethodology } from '../entities/project-template.entity';

/**
 * DTO for validating AI-extracted criteria
 */
export class AIExtractedCriteriaDto {
  @IsString()
  @IsOptional()
  projectName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn([...INDUSTRY_VALUES, null])
  industry?: string | null;

  @IsString()
  @IsOptional()
  @IsIn([...Object.values(ProjectMethodology), null])
  workStyle?: string | null;

  @IsString()
  @IsOptional()
  @IsIn([...TEAM_SIZE_VALUES, null])
  teamSize?: string | null;

  @IsString()
  @IsOptional()
  @IsIn([...TIMELINE_VALUES, null])
  timeline?: string | null;

  @IsString()
  @IsOptional()
  @IsIn([...COMPLEXITY_VALUES, null])
  complexity?: string | null;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  keyFeatures?: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  excludedFeatures?: string[];
}

/**
 * Validation result with typed errors
 */
export interface AIValidationResult {
  isValid: boolean;
  data: AIExtractedCriteriaDto | null;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class AIResponseValidator {
  private readonly logger = new Logger(AIResponseValidator.name);

  /**
   * Validate AI-extracted criteria before use
   * Returns validated data or null with errors
   */
  validateExtractedCriteria(raw: unknown): AIValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. Check if input is an object
    if (!raw || typeof raw !== 'object') {
      return {
        isValid: false,
        data: null,
        errors: ['AI response is not a valid object'],
        warnings: [],
      };
    }

    // 2. Transform to class instance
    const instance = plainToInstance(AIExtractedCriteriaDto, raw);

    // 3. Run validation
    const validationErrors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    // 4. Collect errors
    for (const error of validationErrors) {
      if (error.constraints) {
        errors.push(...Object.values(error.constraints));
      }
    }

    // 5. Add warnings for missing optional fields
    if (!instance.projectName) {
      warnings.push('AI did not extract project name');
    }
    if (!instance.industry) {
      warnings.push('AI did not extract industry');
    }

    // 6. Log validation result
    if (errors.length > 0) {
      this.logger.warn(`AI response validation failed: ${errors.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      data: errors.length === 0 ? instance : null,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize AI-generated string to prevent injection
   */
  sanitizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    // Remove control characters (0x00-0x1F and 0x7F) and excessive whitespace

    return (
      value

        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 1000)
    ); // Max length
  }

  /**
   * Validate template recommendation from AI
   */
  validateTemplateRecommendation(raw: unknown): {
    isValid: boolean;
    templateId: string | null;
    confidence: number;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!raw || typeof raw !== 'object') {
      return {
        isValid: false,
        templateId: null,
        confidence: 0,
        errors: ['Invalid recommendation object'],
      };
    }

    const rec = raw as Record<string, unknown>;

    // Validate templateId
    const templateId =
      typeof rec.templateId === 'string' ? rec.templateId : null;
    if (!templateId) {
      errors.push('Missing template ID');
    }

    // Validate confidence
    const confidence = typeof rec.confidence === 'number' ? rec.confidence : 0;
    if (confidence < 0 || confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      templateId,
      confidence: Math.max(0, Math.min(1, confidence)),
      errors,
    };
  }
}
