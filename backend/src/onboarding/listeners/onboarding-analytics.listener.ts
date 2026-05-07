import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  ONBOARDING_EVENTS,
  OnboardingStepCompletedEvent,
  OnboardingStepSkippedEvent,
  OnboardingStepStartedEvent,
} from '../events/onboarding-events';

/**
 * Fire-and-forget aggregator for onboarding funnel analytics.
 *
 * Each handler performs a single atomic UPSERT against onboarding_analytics so
 * the primary HTTP response is never blocked by aggregation work and concurrent
 * events never produce a lost-update.
 *
 * avgTimeSpent uses an incremental running average (Welford-style):
 *   new_avg = (old_avg * old_count + new_value) / (old_count + 1)
 */
@Injectable()
export class OnboardingAnalyticsListener {
  private readonly logger = new Logger(OnboardingAnalyticsListener.name);

  constructor(private readonly dataSource: DataSource) {}

  @OnEvent(ONBOARDING_EVENTS.STEP_STARTED, { async: true })
  async handleStepStarted(event: OnboardingStepStartedEvent): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO onboarding_analytics ("stepId", "startedCount", "completedCount", "skippedCount", "avgTimeSpent")
         VALUES ($1, 1, 0, 0, 0)
         ON CONFLICT ("stepId")
         DO UPDATE SET
           "startedCount" = onboarding_analytics."startedCount" + 1,
           "updatedAt" = CURRENT_TIMESTAMP`,
        [event.stepId],
      );
    } catch (err) {
      this.logger.error(
        `Failed to record step.started for ${event.stepId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(ONBOARDING_EVENTS.STEP_COMPLETED, { async: true })
  async handleStepCompleted(
    event: OnboardingStepCompletedEvent,
  ): Promise<void> {
    const seconds = Math.max(0, event.timeSpentMs / 1000);
    try {
      await this.dataSource.query(
        `INSERT INTO onboarding_analytics ("stepId", "startedCount", "completedCount", "skippedCount", "avgTimeSpent")
         VALUES ($1, 0, 1, 0, $2)
         ON CONFLICT ("stepId")
         DO UPDATE SET
           "avgTimeSpent" = (
             onboarding_analytics."avgTimeSpent" * onboarding_analytics."completedCount" + $2
           ) / (onboarding_analytics."completedCount" + 1),
           "completedCount" = onboarding_analytics."completedCount" + 1,
           "updatedAt" = CURRENT_TIMESTAMP`,
        [event.stepId, seconds],
      );
    } catch (err) {
      this.logger.error(
        `Failed to record step.completed for ${event.stepId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(ONBOARDING_EVENTS.STEP_SKIPPED, { async: true })
  async handleStepSkipped(event: OnboardingStepSkippedEvent): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO onboarding_analytics ("stepId", "startedCount", "completedCount", "skippedCount", "avgTimeSpent")
         VALUES ($1, 0, 0, 1, 0)
         ON CONFLICT ("stepId")
         DO UPDATE SET
           "skippedCount" = onboarding_analytics."skippedCount" + 1,
           "updatedAt" = CURRENT_TIMESTAMP`,
        [event.stepId],
      );
    } catch (err) {
      this.logger.error(
        `Failed to record step.skipped for ${event.stepId}: ${(err as Error).message}`,
      );
    }
  }
}
