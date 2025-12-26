import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from '../entities/user-preferences.entity';
import { ProjectTemplate } from '../../project-templates/entities/project-template.entity';
import { ProjectIntelligenceService } from '../../ai/services/project-intelligence.service';
import { IssueDefaults } from '../../ai/interfaces/ai-types';

export interface SmartDefaultSuggestion {
  field: string;
  value: any;
  confidence: number;
  reason: string;
  alternatives?: any[];
}

export interface UserBehaviorPattern {
  preferredIssueTypes: string[];
  commonAssignees: Record<string, string>;
  averageSprintVelocity: number;
  workingHours: { start: string; end: string };
  mostActiveDays: number[];
  preferredPriorities: string[];
}

@Injectable()
export class SmartDefaultsService {
  private readonly logger = new Logger(SmartDefaultsService.name);

  constructor(
    @InjectRepository(UserPreferences)
    private preferencesRepo: Repository<UserPreferences>,
    @InjectRepository(ProjectTemplate)
    private templateRepo: Repository<ProjectTemplate>,
    @Optional() private projectIntelligence?: ProjectIntelligenceService,
  ) {}

  /*
   * Get smart default suggestions for a new issue
   * Now AI-powered with fallback to rule-based logic
   */
  async getIssueDefaults(
    userId: string,
    projectId: string,
    context?: {
      issueType?: string;
      projectType?: string;
      teamMembers?: string[];
    },
  ): Promise<SmartDefaultSuggestion[]> {
    // Try AI-powered suggestions first
    if (this.projectIntelligence?.isAvailable && context) {
      try {
        const aiDefaults = await this.projectIntelligence.generateIssueDefaults(
          {
            projectType: context.projectType || 'general',
            issueType: context.issueType,
            teamMembers: context.teamMembers || [],
          },
        );

        if (aiDefaults) {
          this.logger.debug('Using AI-generated issue defaults');
          return this.convertAIToSuggestions(aiDefaults);
        }
      } catch {
        this.logger.warn('AI issue defaults failed, falling back to rules');
      }
    }

    // Fallback to existing rule-based logic
    return this.getManualIssueDefaults(userId, projectId, context);
  }

  /**
   * Convert AI defaults to suggestion format
   */
  private convertAIToSuggestions(
    aiDefaults: IssueDefaults,
  ): SmartDefaultSuggestion[] {
    const suggestions: SmartDefaultSuggestion[] = [];

    if (aiDefaults.suggestedType) {
      suggestions.push({
        field: 'type',
        value: aiDefaults.suggestedType,
        confidence: 0.85,
        reason: `AI: ${aiDefaults.reasoning}`,
      });
    }

    if (aiDefaults.suggestedPriority) {
      suggestions.push({
        field: 'priority',
        value: aiDefaults.suggestedPriority,
        confidence: 0.8,
        reason: 'AI-optimized priority based on context',
      });
    }

    if (aiDefaults.suggestedAssignee) {
      suggestions.push({
        field: 'assignee',
        value: aiDefaults.suggestedAssignee,
        confidence: 0.7,
        reason: 'AI-suggested based on team patterns',
      });
    }

    if (aiDefaults.estimatedDueDate) {
      suggestions.push({
        field: 'dueDate',
        value: aiDefaults.estimatedDueDate,
        confidence: 0.65,
        reason: 'AI-estimated timeline',
      });
    }

    return suggestions;
  }

  /**
   * Original rule-based issue defaults (fallback)
   */
  private async getManualIssueDefaults(
    userId: string,
    projectId: string,
    context?: {
      issueType?: string;
      projectType?: string;
      teamMembers?: string[];
    },
  ): Promise<SmartDefaultSuggestion[]> {
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    const suggestions: SmartDefaultSuggestion[] = [];

    if (!preferences) {
      return this.getBasicDefaults();
    }

    const behaviorPattern = this.analyzeUserBehavior(preferences);

    // Suggest issue type based on user patterns
    if (context?.issueType) {
      const typeSuggestion = this.suggestIssueType(
        context.issueType,
        behaviorPattern,
        preferences.preferences.learning.preferredIssueTypes,
      );
      if (typeSuggestion) {
        suggestions.push(typeSuggestion);
      }
    }

    // Suggest assignee based on workload and patterns
    if (context?.teamMembers && context.teamMembers.length > 0) {
      const assigneeSuggestion = this.suggestAssignee(
        context.teamMembers,
        behaviorPattern,
      );
      if (assigneeSuggestion) {
        suggestions.push(assigneeSuggestion);
      }
    }

    // Suggest priority based on patterns
    const prioritySuggestion = this.suggestPriority(behaviorPattern);
    if (prioritySuggestion) {
      suggestions.push(prioritySuggestion);
    }

    // Suggest due date based on project timeline and user patterns
    const dueDateSuggestion = this.suggestDueDate(
      behaviorPattern,
      context?.projectType,
    );
    if (dueDateSuggestion) {
      suggestions.push(dueDateSuggestion);
    }

    // Suggest story points if enabled
    if (
      preferences.preferences.work.storyPointScale &&
      preferences.preferences.work.storyPointScale.length > 0
    ) {
      const storyPointsSuggestion = this.suggestStoryPoints(behaviorPattern);
      if (storyPointsSuggestion) {
        suggestions.push(storyPointsSuggestion);
      }
    }

    return suggestions;
  }

  /**
   * Get smart default suggestions for project creation
   */
  async getProjectDefaults(
    userId: string,
    projectType: string,
  ): Promise<SmartDefaultSuggestion[]> {
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    const suggestions: SmartDefaultSuggestion[] = [];

    if (!preferences) {
      return this.getBasicProjectDefaults();
    }

    // Suggest methodology based on user experience and preferences
    const methodologySuggestion = this.suggestMethodology(
      preferences.preferences.learning.experienceLevel,
      projectType,
    );
    if (methodologySuggestion) {
      suggestions.push(methodologySuggestion);
    }

    // Suggest sprint duration based on user patterns
    const sprintDurationSuggestion = this.suggestSprintDuration(
      preferences.preferences.work.defaultSprintDuration,
      projectType,
    );
    if (sprintDurationSuggestion) {
      suggestions.push(sprintDurationSuggestion);
    }

    // Suggest team roles based on project type and user experience
    const teamRolesSuggestion = this.suggestTeamRoles(projectType);
    if (teamRolesSuggestion) {
      suggestions.push(teamRolesSuggestion);
    }

    // Suggest issue types based on project type and user preferences
    const issueTypesSuggestion = this.suggestIssueTypes(projectType);
    if (issueTypesSuggestion) {
      suggestions.push(issueTypesSuggestion);
    }

    return suggestions;
  }

  /**
   * Learn from user behavior and update preferences
   */
  async learnFromBehavior(
    userId: string,
    behavior: {
      action: string;
      context: Record<string, unknown>;
      timestamp: Date;
    },
  ): Promise<void> {
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    if (!preferences) {
      return;
    }

    // Update learning data based on behavior
    const learningData = preferences.learningData || {};

    switch (behavior.action) {
      case 'issue_created':
        this.updateIssueCreationPattern(learningData, behavior.context);
        break;
      case 'issue_assigned':
        this.updateAssignmentPattern(learningData, behavior.context);
        break;
      case 'sprint_completed':
        this.updateVelocityPattern(learningData, behavior.context);
        break;
      case 'time_tracked':
        this.updateTimeTrackingPattern(learningData, behavior.context);
        break;
    }

    // Update preferences with new learning data
    await this.preferencesRepo.update(
      { userId },
      {
        learningData: learningData as object,
        updatedAt: new Date(),
      },
    );
  }

  /**
   * Get user behavior patterns for analysis
   */
  async getUserBehaviorPattern(userId: string): Promise<UserBehaviorPattern> {
    const preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    if (!preferences) {
      return this.getDefaultBehaviorPattern();
    }

    return this.analyzeUserBehavior(preferences);
  }

  private analyzeUserBehavior(
    preferences: UserPreferences,
  ): UserBehaviorPattern {
    const learning = preferences.preferences.learning;
    const work = preferences.preferences.work;

    return {
      preferredIssueTypes: learning.preferredIssueTypes || ['Task', 'Bug'],
      commonAssignees: learning.commonAssigneePatterns || {},
      averageSprintVelocity: learning.averageSprintVelocity || 0,
      workingHours: work.workingHours,
      mostActiveDays: this.extractActiveDays(work.workingHours.workingDays),
      preferredPriorities: learning.preferredPriorities || ['Medium'],
    };
  }

  private suggestIssueType(
    currentType: string,
    behaviorPattern: UserBehaviorPattern,
    preferredTypes: string[],
  ): SmartDefaultSuggestion | null {
    if (preferredTypes.includes(currentType)) {
      return {
        field: 'type',
        value: currentType,
        confidence: 0.8,
        reason: 'Matches your preferred issue types',
        alternatives: preferredTypes.filter((t) => t !== currentType),
      };
    }

    return null;
  }

  private suggestAssignee(
    teamMembers: string[],
    behaviorPattern: UserBehaviorPattern,
  ): SmartDefaultSuggestion | null {
    // Simple logic: suggest based on workload and patterns
    // In a real implementation, you'd query actual workload data

    const commonAssignees = Object.keys(behaviorPattern.commonAssignees);
    const availableMembers = teamMembers.filter(
      (member) =>
        !commonAssignees.includes(member) ||
        behaviorPattern.commonAssignees[member] !== 'overloaded',
    );

    if (availableMembers.length === 0) {
      return null;
    }

    // Suggest the most commonly assigned member who's available
    const suggestedMember = availableMembers[0];

    return {
      field: 'assignee',
      value: suggestedMember,
      confidence: 0.6,
      reason: 'Based on your assignment patterns',
      alternatives: availableMembers.slice(1, 3),
    };
  }

  private suggestPriority(
    behaviorPattern: UserBehaviorPattern,
  ): SmartDefaultSuggestion {
    const mostCommonPriority =
      behaviorPattern.preferredPriorities[0] || 'Medium';

    return {
      field: 'priority',
      value: mostCommonPriority,
      confidence: 0.7,
      reason: 'Based on your typical priority choices',
      alternatives: behaviorPattern.preferredPriorities.slice(1),
    };
  }

  private suggestDueDate(
    behaviorPattern: UserBehaviorPattern,
    projectType?: string,
  ): SmartDefaultSuggestion | null {
    // Calculate due date based on working hours and project type
    const baseDays = this.getBaseDueDateDays(projectType);
    const workingDays = this.calculateWorkingDays(baseDays);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + workingDays);

    return {
      field: 'dueDate',
      value: dueDate.toISOString().split('T')[0],
      confidence: 0.6,
      reason: `Suggested based on ${projectType || 'project'} timeline`,
    };
  }

  private suggestStoryPoints(
    behaviorPattern: UserBehaviorPattern,
  ): SmartDefaultSuggestion {
    const scale = [1, 2, 3, 5, 8, 13, 21];
    const averageVelocity = behaviorPattern.averageSprintVelocity;

    // Suggest middle of the scale if no velocity data
    const suggestedPoints =
      averageVelocity > 0
        ? Math.min(8, Math.max(2, Math.round(averageVelocity / 4)))
        : 5;

    return {
      field: 'storyPoints',
      value: suggestedPoints,
      confidence: 0.5,
      reason: "Based on your team's velocity patterns",
      alternatives: scale.filter((p) => p !== suggestedPoints).slice(0, 3),
    };
  }

  private suggestMethodology(
    experienceLevel: string,
    projectType: string,
  ): SmartDefaultSuggestion {
    const methodologyMap: Record<string, string> = {
      software_development: experienceLevel === 'beginner' ? 'kanban' : 'scrum',
      marketing: 'kanban',
      product_launch: 'agile',
      research: 'waterfall',
      event_planning: 'waterfall',
    };

    const suggested = methodologyMap[projectType] || 'agile';

    return {
      field: 'methodology',
      value: suggested,
      confidence: 0.8,
      reason: `Recommended for ${projectType} projects with ${experienceLevel} experience`,
      alternatives: ['agile', 'scrum', 'kanban', 'waterfall'].filter(
        (m) => m !== suggested,
      ),
    };
  }

  private suggestSprintDuration(
    userDefault: number,
    projectType: string,
  ): SmartDefaultSuggestion {
    const durationMap: Record<string, number> = {
      software_development: 14,
      marketing: 7,
      product_launch: 21,
      research: 30,
      event_planning: 14,
    };

    const suggested = durationMap[projectType] || userDefault;

    return {
      field: 'sprintDuration',
      value: suggested,
      confidence: 0.7,
      reason: `Optimal for ${projectType} projects`,
      alternatives: [7, 14, 21, 30].filter((d) => d !== suggested),
    };
  }

  private suggestTeamRoles(projectType: string): SmartDefaultSuggestion {
    const roleMap: Record<string, string[]> = {
      software_development: [
        'Product Owner',
        'Scrum Master',
        'Developer',
        'QA Engineer',
      ],
      marketing: ['Campaign Manager', 'Content Creator', 'Designer', 'Analyst'],
      product_launch: [
        'Product Manager',
        'Marketing Lead',
        'Developer',
        'QA Engineer',
      ],
      research: ['Research Lead', 'Data Analyst', 'Research Assistant'],
      event_planning: [
        'Event Manager',
        'Coordinator',
        'Marketing',
        'Logistics',
      ],
    };

    const suggestedRoles = roleMap[projectType] || ['Manager', 'Team Member'];

    return {
      field: 'teamRoles',
      value: suggestedRoles,
      confidence: 0.8,
      reason: `Standard roles for ${projectType} projects`,
    };
  }

  private suggestIssueTypes(projectType: string): SmartDefaultSuggestion {
    const typeMap: Record<string, string[]> = {
      software_development: ['Bug', 'Task', 'Story', 'Epic', 'Sub-task'],
      marketing: ['Campaign', 'Content', 'Design', 'Research', 'Analysis'],
      product_launch: ['Feature', 'Bug', 'Task', 'Milestone', 'Risk'],
      research: ['Research', 'Analysis', 'Experiment', 'Documentation'],
      event_planning: ['Task', 'Vendor', 'Logistics', 'Marketing'],
    };

    const suggestedTypes = typeMap[projectType] || ['Task', 'Bug', 'Feature'];

    return {
      field: 'issueTypes',
      value: suggestedTypes,
      confidence: 0.9,
      reason: `Standard issue types for ${projectType} projects`,
    };
  }

  private getBasicDefaults(): SmartDefaultSuggestion[] {
    return [
      {
        field: 'priority',
        value: 'Medium',
        confidence: 0.5,
        reason: 'Default priority',
      },
      {
        field: 'type',
        value: 'Task',
        confidence: 0.5,
        reason: 'Default issue type',
      },
    ];
  }

  private getBasicProjectDefaults(): SmartDefaultSuggestion[] {
    return [
      {
        field: 'methodology',
        value: 'agile',
        confidence: 0.6,
        reason: 'Recommended for most projects',
      },
      {
        field: 'sprintDuration',
        value: 14,
        confidence: 0.6,
        reason: 'Standard sprint duration',
      },
    ];
  }

  private updateIssueCreationPattern(
    learningData: {
      issueCreationPattern?: Record<string, number>;
    },
    context: { type?: string },
  ): void {
    if (!learningData.issueCreationPattern) {
      learningData.issueCreationPattern = {};
    }

    const type = context.type || 'Task';
    learningData.issueCreationPattern[type] =
      (learningData.issueCreationPattern[type] || 0) + 1;
  }

  private updateAssignmentPattern(
    learningData: {
      assignmentPattern?: Record<string, number>;
    },
    context: { assignee?: string },
  ): void {
    if (!learningData.assignmentPattern) {
      learningData.assignmentPattern = {};
    }

    const assignee = context.assignee;
    if (assignee) {
      learningData.assignmentPattern[assignee] =
        (learningData.assignmentPattern[assignee] || 0) + 1;
    }
  }

  private updateVelocityPattern(
    learningData: {
      velocityHistory?: { velocity: number; timestamp: Date }[];
    },
    context: { velocity?: number },
  ): void {
    if (!learningData.velocityHistory) {
      learningData.velocityHistory = [];
    }

    const velocity = context.velocity || 0;
    learningData.velocityHistory.push({
      velocity,
      timestamp: new Date(),
    });

    // Keep only last 10 sprints
    if (learningData.velocityHistory.length > 10) {
      learningData.velocityHistory = learningData.velocityHistory.slice(-10);
    }
  }

  private updateTimeTrackingPattern(
    learningData: {
      timeTrackingPattern?: Record<string, number[]>;
    },
    context: { hours?: number; issueType?: string },
  ): void {
    if (!learningData.timeTrackingPattern) {
      learningData.timeTrackingPattern = {};
    }

    const hours = context.hours || 0;
    const type = context.issueType || 'Task';

    if (!learningData.timeTrackingPattern[type]) {
      learningData.timeTrackingPattern[type] = [];
    }

    learningData.timeTrackingPattern[type].push(hours);

    // Keep only last 20 entries per type
    if (learningData.timeTrackingPattern[type].length > 20) {
      learningData.timeTrackingPattern[type] =
        learningData.timeTrackingPattern[type].slice(-20);
    }
  }

  private extractActiveDays(workingDays: number[]): number[] {
    return workingDays || [1, 2, 3, 4, 5]; // Monday to Friday by default
  }

  private getBaseDueDateDays(projectType?: string): number {
    const baseDaysMap: Record<string, number> = {
      software_development: 7,
      marketing: 3,
      product_launch: 14,
      research: 21,
      event_planning: 7,
    };

    return baseDaysMap[projectType || 'default'] || 7;
  }

  private calculateWorkingDays(totalDays: number): number {
    // Simple calculation - in reality, you'd account for weekends and holidays
    return totalDays;
  }

  /**
   * Get full user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    let preferences = await this.preferencesRepo.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences if not found
      const defaultPreferences: Partial<UserPreferences> = {
        userId,
        preferences: {
          ui: {
            theme: 'light',
            accentColor: '#3B82F6', // Tailwind Blue-500
            compactMode: false,
            sidebarStyle: 'default',
          },
          notifications: {
            email: true,
            push: true,
            inApp: true,
            frequency: 'immediate',
            types: {
              issueAssigned: true,
              issueUpdated: true,
              commentAdded: true,
              sprintStarted: true,
              sprintCompleted: true,
              projectInvited: true,
              // Enterprise: @mentions
              mentionedInComment: true,
              mentionedInDescription: true,
            },
          },
          work: {
            workingHours: {
              start: '09:00',
              end: '17:00',
              timezone: 'UTC',
              workingDays: [1, 2, 3, 4, 5],
            },
            defaultSprintDuration: 14,
            autoAssignToMe: false,
            enableTimeTracking: true,
            storyPointScale: [1, 2, 3, 5, 8, 13, 21],
          },
          learning: {
            experienceLevel: 'intermediate',
            workingStyle: 'mixed',
            preferredIssueTypes: ['Task', 'Bug'],
            preferredPriorities: ['Medium'],
            commonAssigneePatterns: {},
            averageSprintVelocity: 0,
          },
          onboarding: {
            isCompleted: false,
            currentStep: 'welcome',
            completedSteps: [],
            skippedSteps: [],
          },
        },
      };
      preferences = this.preferencesRepo.create(defaultPreferences);
      await this.preferencesRepo.save(preferences);
    }

    return preferences;
  }

  /**
   * Update user preferences with proper deep merge
   * Fixed: Now handles nested objects (notifications.types, work.workingHours) correctly
   */
  async updateUserPreferences(
    userId: string,
    updates: Partial<UserPreferences['preferences']>,
  ): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(userId);

    // Conditional deep merge - only merge if field provided
    if (updates.ui) {
      preferences.preferences.ui = {
        ...preferences.preferences.ui,
        ...updates.ui,
      };
    }

    if (updates.notifications) {
      // Handle nested types object separately
      const types = updates.notifications.types
        ? {
            ...preferences.preferences.notifications.types,
            ...updates.notifications.types,
          }
        : preferences.preferences.notifications.types;

      preferences.preferences.notifications = {
        ...preferences.preferences.notifications,
        ...updates.notifications,
        types,
      };
    }

    if (updates.work) {
      // Handle nested workingHours object separately
      const workingHours = updates.work.workingHours
        ? {
            ...preferences.preferences.work.workingHours,
            ...updates.work.workingHours,
          }
        : preferences.preferences.work.workingHours;

      preferences.preferences.work = {
        ...preferences.preferences.work,
        ...updates.work,
        workingHours,
      };
    }

    if (updates.learning) {
      preferences.preferences.learning = {
        ...preferences.preferences.learning,
        ...updates.learning,
      };
    }

    if (updates.onboarding) {
      preferences.preferences.onboarding = {
        ...preferences.preferences.onboarding,
        ...updates.onboarding,
      };
    }

    return this.preferencesRepo.save(preferences);
  }

  private getDefaultBehaviorPattern(): UserBehaviorPattern {
    return {
      preferredIssueTypes: ['Task', 'Bug'],
      commonAssignees: {},
      averageSprintVelocity: 0,
      workingHours: { start: '09:00', end: '17:00' },
      mostActiveDays: [1, 2, 3, 4, 5],
      preferredPriorities: ['Medium'],
    };
  }
}
