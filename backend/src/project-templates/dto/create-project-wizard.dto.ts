import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProjectMethodology } from '../entities/project-template.entity';

class ProjectWizardDataDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsOptional()
  projectKey?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  teamSize: string;

  @IsString()
  @IsEnum(['short', 'medium', 'long'])
  timeline: 'short' | 'medium' | 'long';

  @IsString()
  @IsNotEmpty()
  industry: string;

  @IsEnum(ProjectMethodology)
  methodology: ProjectMethodology;

  @IsString()
  @IsEnum(['simple', 'moderate', 'complex'])
  complexity: 'simple' | 'moderate' | 'complex';

  @IsString()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  teamExperience: 'beginner' | 'intermediate' | 'advanced';

  @IsString()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  userExperience: 'beginner' | 'intermediate' | 'advanced';

  @IsBoolean()
  hasExternalStakeholders: boolean;

  @IsBoolean()
  requiresCompliance: boolean;

  @IsString()
  @IsEnum(['low', 'medium', 'high'])
  budget: 'low' | 'medium' | 'high';
}

export class CreateProjectWizardDto {
  @ValidateNested()
  @Type(() => ProjectWizardDataDto)
  wizardData: ProjectWizardDataDto;

  @IsString()
  @IsNotEmpty()
  templateId: string;
}
