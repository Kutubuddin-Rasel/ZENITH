/**
 * Validated Wizard DTO
 *
 * Layer 2 of the Anti-Corruption Pattern.
 * This is the domain-safe, strongly-typed representation of wizard data
 * after validation. Used internally by services.
 */

import {
  ProjectMethodology,
  ProjectCategory,
} from '../entities/project-template.entity';
import {
  TeamSizeValue,
  TimelineValue,
  IndustryValue,
  ComplexityValue,
  ExperienceValue,
} from './wizard-input.dto';

/**
 * Validated wizard data - guaranteed to be valid after DTO validation
 * This is the "clean" domain representation
 */
export interface ValidatedWizardData {
  projectName: string;
  projectKey: string | null;
  description: string | null;
  teamSize: TeamSizeValue;
  timeline: TimelineValue;
  industry: IndustryValue;
  methodology: ProjectMethodology;
  complexity: ComplexityValue;
  userExperience: ExperienceValue;
  templateId: string | null;
}

/**
 * Team size as numeric range for scoring
 */
export interface TeamSizeRange {
  min: number;
  max: number;
  label: string;
}

/**
 * Mapping from team size string to numeric range
 */
export const TEAM_SIZE_RANGES: Record<TeamSizeValue, TeamSizeRange> = {
  '1': { min: 1, max: 1, label: 'solo' },
  '2-5': { min: 2, max: 5, label: 'small' },
  '6-10': { min: 6, max: 10, label: 'medium' },
  '11-20': { min: 11, max: 20, label: 'large' },
  '20+': { min: 21, max: 100, label: 'enterprise' },
};

/**
 * Timeline duration in months
 */
export interface TimelineDuration {
  minMonths: number;
  maxMonths: number;
  label: string;
}

/**
 * Mapping from timeline string to duration
 */
export const TIMELINE_DURATIONS: Record<TimelineValue, TimelineDuration> = {
  short: { minMonths: 0, maxMonths: 3, label: 'Short-term' },
  medium: { minMonths: 3, maxMonths: 6, label: 'Medium-term' },
  long: { minMonths: 6, maxMonths: 24, label: 'Long-term' },
};

/**
 * Industry to project category mapping
 */
export const INDUSTRY_CATEGORY_MAP: Record<IndustryValue, ProjectCategory> = {
  technology: ProjectCategory.SOFTWARE_DEVELOPMENT,
  healthcare: ProjectCategory.CUSTOM,
  fintech: ProjectCategory.SOFTWARE_DEVELOPMENT,
  ecommerce: ProjectCategory.CUSTOM,
  education: ProjectCategory.CUSTOM,
  agency: ProjectCategory.CUSTOM,
  startup: ProjectCategory.SOFTWARE_DEVELOPMENT,
  enterprise: ProjectCategory.CUSTOM,
};
