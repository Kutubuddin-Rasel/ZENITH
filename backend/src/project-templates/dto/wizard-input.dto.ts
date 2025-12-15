/**
 * Raw Wizard Input DTO
 *
 * Layer 1 of the Anti-Corruption Pattern.
 * This DTO receives raw user input and validates it using class-validator.
 * All fields are validated BEFORE any business logic is applied.
 */

import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ProjectMethodology } from '../entities/project-template.entity';

/**
 * Valid team size values
 */
export const TEAM_SIZE_VALUES = ['1', '2-5', '6-10', '11-20', '20+'] as const;
export type TeamSizeValue = (typeof TEAM_SIZE_VALUES)[number];

/**
 * Valid timeline values
 */
export const TIMELINE_VALUES = ['short', 'medium', 'long'] as const;
export type TimelineValue = (typeof TIMELINE_VALUES)[number];

/**
 * Valid industry values (8-industry system)
 */
export const INDUSTRY_VALUES = [
  'technology',
  'healthcare',
  'fintech',
  'ecommerce',
  'education',
  'agency',
  'startup',
  'enterprise',
] as const;
export type IndustryValue = (typeof INDUSTRY_VALUES)[number];

/**
 * Valid complexity values
 */
export const COMPLEXITY_VALUES = ['simple', 'moderate', 'complex'] as const;
export type ComplexityValue = (typeof COMPLEXITY_VALUES)[number];

/**
 * Valid experience level values
 */
export const EXPERIENCE_VALUES = [
  'beginner',
  'intermediate',
  'advanced',
] as const;
export type ExperienceValue = (typeof EXPERIENCE_VALUES)[number];

/**
 * Raw input DTO for wizard submission
 * Validates all user input before processing
 */
export class WizardInputDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  @MinLength(3, { message: 'Project name must be at least 3 characters' })
  @MaxLength(100, { message: 'Project name must not exceed 100 characters' })
  projectName: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsString()
  @IsIn(TEAM_SIZE_VALUES, { message: 'Invalid team size value' })
  teamSize: TeamSizeValue;

  @IsString()
  @IsIn(TIMELINE_VALUES, { message: 'Invalid timeline value' })
  timeline: TimelineValue;

  @IsString()
  @IsIn(INDUSTRY_VALUES, { message: 'Invalid industry value' })
  industry: IndustryValue;

  @IsEnum(ProjectMethodology, { message: 'Invalid methodology value' })
  methodology: ProjectMethodology;

  @IsString()
  @IsIn(COMPLEXITY_VALUES, { message: 'Invalid complexity value' })
  complexity: ComplexityValue;

  @IsString()
  @IsIn(EXPERIENCE_VALUES, { message: 'Invalid experience level' })
  userExperience: ExperienceValue;

  @IsUUID('4', { message: 'Invalid template ID format' })
  @IsOptional()
  templateId?: string;
}

/**
 * DTO for submitting complete wizard data and creating a project
 * Extends WizardInputDto with organization context
 */
export class CreateProjectFromWizardDto extends WizardInputDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(5)
  projectKey?: string;
}
