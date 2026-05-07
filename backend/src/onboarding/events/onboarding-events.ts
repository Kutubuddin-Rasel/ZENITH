/**
 * Onboarding Event Payloads — Typed Contracts for PLG Hooks.
 *
 * Emitted AFTER the DB write succeeds so listeners (analytics, gamification,
 * lifecycle emails) never observe phantom progress.
 *
 * @see OnboardingService for emission points
 */

export const ONBOARDING_EVENTS = {
  STEP_STARTED: 'onboarding.step.started',
  STEP_COMPLETED: 'onboarding.step.completed',
  STEP_SKIPPED: 'onboarding.step.skipped',
  COMPLETED: 'onboarding.completed',
} as const;

interface BaseOnboardingEvent {
  readonly userId: string;
  readonly projectId?: string;
  readonly timestamp: Date;
}

export interface OnboardingStepStartedEvent extends BaseOnboardingEvent {
  readonly stepId: string;
}

export interface OnboardingStepCompletedEvent extends BaseOnboardingEvent {
  readonly stepId: string;
  readonly timeSpentMs: number;
}

export interface OnboardingStepSkippedEvent extends BaseOnboardingEvent {
  readonly stepId: string;
  readonly reason?: string;
}

export interface OnboardingCompletedEvent extends BaseOnboardingEvent {
  readonly totalSteps: number;
  readonly skippedSteps: number;
  readonly completedWithoutSkipping: boolean;
}
