/**
 * Wizard DTO Mapper
 *
 * Layer 3 of the Anti-Corruption Pattern.
 * This service is the ONLY place where DTO → Domain conversion happens.
 * It ensures type-safe, validated transformation of wizard input to
 * IntelligentCriteria for template scoring.
 */

import { Injectable } from '@nestjs/common';
import {
  ProjectMethodology,
  ProjectCategory,
} from '../entities/project-template.entity';
import {
  WizardInputDto,
  CreateProjectFromWizardDto,
  TeamSizeValue,
  TimelineValue,
  IndustryValue,
  ComplexityValue,
  ExperienceValue,
} from '../dto/wizard-input.dto';
import {
  ValidatedWizardData,
  TEAM_SIZE_RANGES,
  TIMELINE_DURATIONS,
  INDUSTRY_CATEGORY_MAP,
} from '../dto/validated-wizard.dto';
import { IntelligentCriteria } from '../../ai/interfaces/intelligent-criteria.interface';

/**
 * Extended IntelligentCriteria with experience level
 * (This will be added to the main interface in Phase 3)
 */
export interface ExtendedIntelligentCriteria extends IntelligentCriteria {
  experienceLevel?: ExperienceValue;
  timelineDurationMonths?: number;
}

@Injectable()
export class WizardDtoMapper {
  /**
   * Convert raw wizard input DTO to validated domain data
   * This is a pure transformation with no side effects
   */
  toValidatedWizardData(
    dto: WizardInputDto | CreateProjectFromWizardDto,
  ): ValidatedWizardData {
    return {
      projectName: dto.projectName.trim(),
      projectKey:
        'projectKey' in dto && dto.projectKey
          ? dto.projectKey.toUpperCase()
          : null,
      description: dto.description?.trim() || null,
      teamSize: dto.teamSize,
      timeline: dto.timeline,
      industry: dto.industry,
      methodology: dto.methodology,
      complexity: dto.complexity,
      userExperience: dto.userExperience,
      templateId: dto.templateId || null,
    };
  }

  /**
   * Convert validated wizard data to IntelligentCriteria for template scoring
   * This is the core anti-corruption transformation
   */
  toIntelligentCriteria(
    data: ValidatedWizardData,
  ): ExtendedIntelligentCriteria {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future use
    const _teamSizeRange = TEAM_SIZE_RANGES[data.teamSize];
    const timelineDuration = TIMELINE_DURATIONS[data.timeline];

    return {
      // Basic info
      projectName: data.projectName,
      description: data.description,

      // Category mapping (type-safe)
      projectType: this.mapIndustryToCategory(data.industry),
      industry: data.industry,

      // Team size (using the string format expected by scoring)
      // Type assertion required: ValidatedWizardData uses TeamSizeValue, IntelligentCriteria uses TeamSizeRange
      teamSize:
        data.teamSize as unknown as import('../../ai/interfaces/intelligent-criteria.interface').TeamSizeRange,

      // Work style
      workStyle: data.methodology,
      // Type assertion: TimelineValue to TimelineRange
      timeline:
        data.timeline as unknown as import('../../ai/interfaces/intelligent-criteria.interface').TimelineRange,

      // Complexity-derived values
      hasExternalStakeholders: data.complexity === 'complex',
      wantsApprovalWorkflow: data.complexity !== 'simple',

      // NEW: Experience level for scoring
      experienceLevel: data.userExperience,

      // NEW: Timeline in months for scoring
      timelineDurationMonths:
        (timelineDuration.minMonths + timelineDuration.maxMonths) / 2,

      // Features (derived from complexity)
      keyFeatures: this.deriveKeyFeatures(data.complexity, data.methodology),
      excludedFeatures: [],

      // Stakeholder (derived from complexity - use undefined for now, can be typed later)
      stakeholderType: undefined,

      // Compliance (derived from industry)
      complianceNeeds: this.deriveComplianceNeeds(data.industry),

      // Optional features (can be refined in future)
      wantsTimeTracking:
        data.methodology === ProjectMethodology.AGILE ||
        data.methodology === ProjectMethodology.SCRUM,
      wantsStoryPoints: data.methodology === ProjectMethodology.SCRUM,
    };
  }

  /**
   * Type-safe industry to category mapping
   */
  private mapIndustryToCategory(industry: IndustryValue): ProjectCategory {
    return INDUSTRY_CATEGORY_MAP[industry];
  }

  /**
   * Derive key features based on complexity and methodology
   */
  private deriveKeyFeatures(
    complexity: ComplexityValue,
    methodology: ProjectMethodology,
  ): string[] {
    const features: string[] = [];

    // Complexity-based features
    if (complexity === 'complex') {
      features.push('approval-workflow', 'external-stakeholders', 'compliance');
    } else if (complexity === 'moderate') {
      features.push('approval-workflow');
    }

    // Methodology-based features
    switch (methodology) {
      case ProjectMethodology.SCRUM:
        features.push('sprints', 'story-points', 'velocity-tracking');
        break;
      case ProjectMethodology.KANBAN:
        features.push('wip-limits', 'continuous-flow');
        break;
      case ProjectMethodology.AGILE:
        features.push('sprints', 'flexible-planning');
        break;
      case ProjectMethodology.WATERFALL:
        features.push('phases', 'milestones', 'gantt-chart');
        break;
    }

    return features;
  }

  /**
   * Derive compliance needs based on industry
   */
  private deriveComplianceNeeds(industry: IndustryValue): string[] {
    switch (industry) {
      case 'healthcare':
        return ['HIPAA'];
      case 'fintech':
        return ['SOX', 'PCI-DSS'];
      case 'enterprise':
        return ['SOC2'];
      default:
        return [];
    }
  }

  /**
   * Get team size as numeric value for scoring calculations
   */
  getTeamSizeNumeric(teamSize: TeamSizeValue): number {
    const range = TEAM_SIZE_RANGES[teamSize];
    return (range.min + range.max) / 2;
  }

  /**
   * Get timeline duration in months
   */
  getTimelineMonths(timeline: TimelineValue): number {
    const duration = TIMELINE_DURATIONS[timeline];
    return (duration.minMonths + duration.maxMonths) / 2;
  }
}
