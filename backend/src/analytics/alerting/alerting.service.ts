import { Injectable, Logger } from '@nestjs/common';
import {
    IAlertProvider,
    AlertProviderType,
    AlertPayload,
} from './interfaces/alert.interfaces';
import { SlackAlertProvider } from './providers/slack-alert.provider';
import { PagerDutyAlertProvider } from './providers/pagerduty-alert.provider';

// ---------------------------------------------------------------------------
// Alerting Service (Strategy Pattern)
// ---------------------------------------------------------------------------

/**
 * AlertingService — Centralized alert dispatch with Strategy pattern.
 *
 * PATTERN: Strategy Map<AlertProviderType, IAlertProvider>
 * Each provider handles its own formatting and HTTP transport.
 * Adding a new provider (Teams, Discord, etc.) requires:
 * 1. Implement IAlertProvider
 * 2. Register in the Map — zero changes to this service.
 *
 * RESILIENCE:
 * - Each provider wraps HTTP calls in IntegrationGateway circuit breakers
 * - Provider failures are isolated — Slack failing doesn't block PagerDuty
 * - Disabled providers (missing config) are silently skipped
 */
@Injectable()
export class AlertingService {
    private readonly logger = new Logger(AlertingService.name);
    private readonly providers = new Map<AlertProviderType, IAlertProvider>();

    constructor(
        slackProvider: SlackAlertProvider,
        pagerDutyProvider: PagerDutyAlertProvider,
    ) {
        // Register enabled providers
        if (slackProvider.isEnabled()) {
            this.providers.set(AlertProviderType.SLACK, slackProvider);
            this.logger.log('Registered Slack alert provider');
        }
        if (pagerDutyProvider.isEnabled()) {
            this.providers.set(AlertProviderType.PAGERDUTY, pagerDutyProvider);
            this.logger.log('Registered PagerDuty alert provider');
        }

        if (this.providers.size === 0) {
            this.logger.warn(
                'No alert providers configured — external alerting is disabled',
            );
        }
    }

    /**
     * Dispatch alert to specified providers.
     *
     * ISOLATION: Each provider is called independently.
     * If Slack fails, PagerDuty still gets the alert.
     * Errors are logged but NOT re-thrown — the caller (BullMQ processor)
     * decides retry behavior based on thrown errors.
     */
    async dispatch(
        providerTypes: AlertProviderType[],
        payload: AlertPayload,
    ): Promise<void> {
        const dispatchResults = await Promise.allSettled(
            providerTypes.map((type) => this.sendToProvider(type, payload)),
        );

        // Log failures for monitoring
        for (let i = 0; i < dispatchResults.length; i++) {
            const result = dispatchResults[i];
            if (result.status === 'rejected') {
                const reason =
                    result.reason instanceof Error
                        ? result.reason.message
                        : 'Unknown error';
                this.logger.error(
                    `Alert dispatch to ${providerTypes[i]} failed: ${reason}`,
                );
            }
        }

        // If ALL providers failed, throw to trigger BullMQ retry
        const allFailed = dispatchResults.every((r) => r.status === 'rejected');
        if (allFailed && dispatchResults.length > 0) {
            throw new Error(
                `All alert providers failed for project ${payload.projectId}`,
            );
        }
    }

    private async sendToProvider(
        type: AlertProviderType,
        payload: AlertPayload,
    ): Promise<void> {
        const provider = this.providers.get(type);

        if (!provider) {
            this.logger.debug(
                `Provider ${type} not registered or disabled — skipping`,
            );
            return;
        }

        await provider.sendAlert(payload);
    }
}
