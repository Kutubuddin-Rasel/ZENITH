// src/project-templates/dto/ai-chat.dto.ts
import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsBoolean,
} from 'class-validator';
import {
  ProjectCategory,
  ProjectMethodology,
} from '../entities/project-template.entity';

/**
 * Criteria extracted from user's natural language description
 */
export class ExtractedCriteriaDto {
  @IsOptional()
  @IsString()
  projectName?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  projectType?: ProjectCategory | null;

  @IsOptional()
  @IsString()
  teamSize?: '1' | '2-5' | '6-10' | '11-20' | '20+' | null;

  @IsOptional()
  @IsString()
  workStyle?: ProjectMethodology | null;

  @IsOptional()
  @IsString()
  timeline?: 'short' | 'medium' | 'long' | null;

  @IsOptional()
  @IsArray()
  keyFeatures?: string[];

  // New intelligent fields
  @IsOptional()
  @IsBoolean()
  hasExternalStakeholders?: boolean;

  @IsOptional()
  @IsString()
  stakeholderType?: 'client' | 'partner' | 'public' | 'internal' | null;

  @IsOptional()
  @IsString()
  industry?: string | null;

  @IsOptional()
  @IsBoolean()
  wantsApprovalWorkflow?: boolean;
}

/**
 * Request body for AI chat endpoint
 */
export class AIChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsObject()
  extractedCriteria?: ExtractedCriteriaDto;

  @IsOptional()
  @IsBoolean()
  useIntelligentMode?: boolean;
}

/**
 * Template info in response
 */
export class TemplateInfoDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  methodology: string;
}

/**
 * Template recommendation with reasoning
 */
export class TemplateRecommendationDto {
  template: TemplateInfoDto;
  confidence: number;
  reasoning: string;
}

/**
 * Suggested configuration based on criteria
 */
export class SuggestedConfigDto {
  sprintLength?: number;
  columns?: string[];
  labels?: string[];
}

/**
 * Response from AI chat endpoint (legacy)
 */
export class AIChatResponseDto {
  conversationId: string;
  type: 'question' | 'recommendation';
  message?: string;
  extractedCriteria: ExtractedCriteriaDto;
  missingCriteria?: string[];
  recommendation?: TemplateRecommendationDto;
  alternatives?: TemplateRecommendationDto[];
  suggestedConfig?: SuggestedConfigDto;
}

/**
 * Enhanced response from Intelligent AI chat endpoint
 */
export class IntelligentChatResponseDto extends AIChatResponseDto {
  /** Overall confidence score (0-100) */
  confidence: number;
}
