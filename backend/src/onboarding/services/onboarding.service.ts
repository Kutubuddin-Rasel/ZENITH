import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepStatus,
} from '../entities/onboarding-progress.entity';

export interface OnboardingStepData {
  stepId: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isSkipped: boolean;
  hints: string[];
  nextSteps: string[];
  estimatedTime: number; // minutes
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(OnboardingProgress)
    private onboardingRepo: Repository<OnboardingProgress>,
  ) {}

  /**
   * Initialize onboarding for a new user
   */
  async initializeOnboarding(
    userId: string,
    context?: {
      projectType?: string;
      teamSize?: number;
      methodology?: string;
      userRole?: string;
    },
  ): Promise<OnboardingProgress> {
    // Check if onboarding already exists
    const existing = await this.onboardingRepo.findOne({
      where: { userId, isCompleted: false },
    });

    if (existing) {
      return existing;
    }

    // Create new onboarding progress
    const onboarding = this.onboardingRepo.create({
      userId,
      currentStep: OnboardingStep.WELCOME,
      steps: this.getDefaultSteps(),
      context,
    });

    return this.onboardingRepo.save(onboarding);
  }

  /**
   * Get current onboarding progress for a user
   */
  async getOnboardingProgress(
    userId: string,
  ): Promise<OnboardingProgress | null> {
    return this.onboardingRepo.findOne({
      where: { userId, isCompleted: false },
    });
  }

  /**
   * Update onboarding step progress
   */
  async updateStepProgress(
    userId: string,
    stepId: string,
    status: OnboardingStepStatus,
    data?: Record<string, any>,
  ): Promise<OnboardingProgress> {
    const onboarding = await this.onboardingRepo.findOne({
      where: { userId, isCompleted: false },
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding progress not found');
    }

    // Update the specific step
    const stepIndex = onboarding.steps.findIndex(
      (step) => step.stepId === stepId,
    );
    if (stepIndex === -1) {
      throw new NotFoundException('Step not found');
    }

    const step = onboarding.steps[stepIndex];
    step.status = status;

    if (status === OnboardingStepStatus.IN_PROGRESS) {
      step.startedAt = new Date();
    } else if (status === OnboardingStepStatus.COMPLETED) {
      step.completedAt = new Date();
    } else if (status === OnboardingStepStatus.SKIPPED) {
      step.skippedAt = new Date();
    }

    if (data) {
      step.data = { ...step.data, ...data };
    }

    onboarding.steps[stepIndex] = step;

    // Update current step
    if (status === OnboardingStepStatus.COMPLETED) {
      const nextStep = this.getNextStep(stepId);
      if (nextStep) {
        onboarding.currentStep = nextStep as OnboardingStep;
      } else {
        // All steps completed
        onboarding.isCompleted = true;
        onboarding.completedAt = new Date();
      }
    }

    return this.onboardingRepo.save(onboarding);
  }

  /**
   * Get onboarding steps with progress
   */
  async getOnboardingSteps(userId: string): Promise<OnboardingStepData[]> {
    const onboarding = await this.getOnboardingProgress(userId);

    if (!onboarding) {
      return this.getDefaultStepData();
    }

    return this.getStepDataFromProgress(onboarding);
  }

  /**
   * Skip a step
   */
  async skipStep(
    userId: string,
    stepId: string,
    reason?: string,
  ): Promise<OnboardingProgress> {
    return this.updateStepProgress(
      userId,
      stepId,
      OnboardingStepStatus.SKIPPED,
      { skipReason: reason },
    );
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(userId: string): Promise<OnboardingProgress> {
    const onboarding = await this.onboardingRepo.findOne({
      where: { userId, isCompleted: false },
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding progress not found');
    }

    onboarding.isCompleted = true;
    onboarding.completedAt = new Date();
    onboarding.currentStep = OnboardingStep.COMPLETED;

    return this.onboardingRepo.save(onboarding);
  }

  /**
   * Reset onboarding for a user
   */
  async resetOnboarding(userId: string): Promise<OnboardingProgress> {
    // Delete existing onboarding
    await this.onboardingRepo.delete({ userId });

    // Create new onboarding
    return this.initializeOnboarding(userId);
  }

  private getDefaultSteps() {
    return [
      {
        stepId: OnboardingStep.WELCOME,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: [],
        nextSteps: [OnboardingStep.PROFILE_SETUP],
      },
      {
        stepId: OnboardingStep.PROFILE_SETUP,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Add a profile picture', 'Set your role and skills'],
        nextSteps: [OnboardingStep.PREFERENCES],
      },
      {
        stepId: OnboardingStep.PREFERENCES,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: [
          'Choose your notification preferences',
          'Set your working hours',
        ],
        nextSteps: [OnboardingStep.FIRST_PROJECT],
      },
      {
        stepId: OnboardingStep.FIRST_PROJECT,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: [
          'Use the project wizard for guided setup',
          'Choose a template that matches your needs',
        ],
        nextSteps: [OnboardingStep.TEAM_INVITE],
      },
      {
        stepId: OnboardingStep.TEAM_INVITE,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Invite team members by email', 'Assign appropriate roles'],
        nextSteps: [OnboardingStep.ISSUE_CREATION],
      },
      {
        stepId: OnboardingStep.ISSUE_CREATION,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: [
          'Create your first issue',
          'Use smart defaults for faster setup',
        ],
        nextSteps: [OnboardingStep.SPRINT_PLANNING],
      },
      {
        stepId: OnboardingStep.SPRINT_PLANNING,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Create your first sprint', 'Add issues to the sprint'],
        nextSteps: [OnboardingStep.BOARD_VIEW],
      },
      {
        stepId: OnboardingStep.BOARD_VIEW,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Explore the board view', 'Drag issues between columns'],
        nextSteps: [OnboardingStep.NOTIFICATIONS],
      },
      {
        stepId: OnboardingStep.NOTIFICATIONS,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Check your notification settings', 'Test real-time updates'],
        nextSteps: [OnboardingStep.REPORTS],
      },
      {
        stepId: OnboardingStep.REPORTS,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: ['Explore the reports section', 'View project analytics'],
        nextSteps: [OnboardingStep.COMPLETED],
      },
      {
        stepId: OnboardingStep.COMPLETED,
        status: OnboardingStepStatus.PENDING,
        data: {},
        hints: [],
        nextSteps: [],
      },
    ];
  }

  private getDefaultStepData(): OnboardingStepData[] {
    return [
      {
        stepId: OnboardingStep.WELCOME,
        title: 'Welcome to Zenith',
        description:
          "Let's get you started with your project management journey",
        isCompleted: false,
        isSkipped: false,
        hints: [],
        nextSteps: ['Profile Setup'],
        estimatedTime: 2,
      },
      {
        stepId: OnboardingStep.PROFILE_SETUP,
        title: 'Set Up Your Profile',
        description: 'Complete your profile to personalize your experience',
        isCompleted: false,
        isSkipped: false,
        hints: ['Add a profile picture', 'Set your role and skills'],
        nextSteps: ['Preferences'],
        estimatedTime: 3,
      },
      {
        stepId: OnboardingStep.PREFERENCES,
        title: 'Configure Preferences',
        description: 'Customize your workspace and notification settings',
        isCompleted: false,
        isSkipped: false,
        hints: [
          'Choose your notification preferences',
          'Set your working hours',
        ],
        nextSteps: ['First Project'],
        estimatedTime: 5,
      },
      {
        stepId: OnboardingStep.FIRST_PROJECT,
        title: 'Create Your First Project',
        description: 'Use our intelligent wizard to set up your first project',
        isCompleted: false,
        isSkipped: false,
        hints: [
          'Use the project wizard for guided setup',
          'Choose a template that matches your needs',
        ],
        nextSteps: ['Team Invite'],
        estimatedTime: 10,
      },
      {
        stepId: OnboardingStep.TEAM_INVITE,
        title: 'Invite Your Team',
        description: 'Add team members and assign roles',
        isCompleted: false,
        isSkipped: false,
        hints: ['Invite team members by email', 'Assign appropriate roles'],
        nextSteps: ['Issue Creation'],
        estimatedTime: 5,
      },
      {
        stepId: OnboardingStep.ISSUE_CREATION,
        title: 'Create Your First Issue',
        description: 'Learn how to create and manage issues',
        isCompleted: false,
        isSkipped: false,
        hints: [
          'Create your first issue',
          'Use smart defaults for faster setup',
        ],
        nextSteps: ['Sprint Planning'],
        estimatedTime: 5,
      },
      {
        stepId: OnboardingStep.SPRINT_PLANNING,
        title: 'Plan Your First Sprint',
        description: 'Set up sprints and organize your work',
        isCompleted: false,
        isSkipped: false,
        hints: ['Create your first sprint', 'Add issues to the sprint'],
        nextSteps: ['Board View'],
        estimatedTime: 8,
      },
      {
        stepId: OnboardingStep.BOARD_VIEW,
        title: 'Explore the Board',
        description: 'Learn how to use the visual board interface',
        isCompleted: false,
        isSkipped: false,
        hints: ['Explore the board view', 'Drag issues between columns'],
        nextSteps: ['Notifications'],
        estimatedTime: 5,
      },
      {
        stepId: OnboardingStep.NOTIFICATIONS,
        title: 'Set Up Notifications',
        description: 'Configure how you receive updates',
        isCompleted: false,
        isSkipped: false,
        hints: ['Check your notification settings', 'Test real-time updates'],
        nextSteps: ['Reports'],
        estimatedTime: 3,
      },
      {
        stepId: OnboardingStep.REPORTS,
        title: 'Explore Reports',
        description: 'Discover analytics and reporting features',
        isCompleted: false,
        isSkipped: false,
        hints: ['Explore the reports section', 'View project analytics'],
        nextSteps: ['Completed'],
        estimatedTime: 5,
      },
      {
        stepId: OnboardingStep.COMPLETED,
        title: "You're All Set!",
        description:
          "Congratulations! You're ready to manage projects like a pro",
        isCompleted: false,
        isSkipped: false,
        hints: [],
        nextSteps: [],
        estimatedTime: 1,
      },
    ];
  }

  private getStepDataFromProgress(
    onboarding: OnboardingProgress,
  ): OnboardingStepData[] {
    const defaultSteps = this.getDefaultStepData();

    return defaultSteps.map((stepData) => {
      const progressStep = onboarding.steps.find(
        (step) => step.stepId === stepData.stepId,
      );

      if (progressStep) {
        return {
          ...stepData,
          isCompleted: progressStep.status === OnboardingStepStatus.COMPLETED,
          isSkipped: progressStep.status === OnboardingStepStatus.SKIPPED,
          hints: progressStep.hints || stepData.hints,
          nextSteps: progressStep.nextSteps || stepData.nextSteps,
        };
      }

      return stepData;
    });
  }

  private getNextStep(currentStep: string): string | null {
    const stepOrder = [
      OnboardingStep.WELCOME,
      OnboardingStep.PROFILE_SETUP,
      OnboardingStep.PREFERENCES,
      OnboardingStep.FIRST_PROJECT,
      OnboardingStep.TEAM_INVITE,
      OnboardingStep.ISSUE_CREATION,
      OnboardingStep.SPRINT_PLANNING,
      OnboardingStep.BOARD_VIEW,
      OnboardingStep.NOTIFICATIONS,
      OnboardingStep.REPORTS,
      OnboardingStep.COMPLETED,
    ];

    const currentIndex = stepOrder.indexOf(currentStep as OnboardingStep);
    if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
      return null;
    }

    return stepOrder[currentIndex + 1];
  }
}
