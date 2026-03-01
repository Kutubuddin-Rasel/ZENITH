import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationGateway } from '../../../core/integrations/integration.gateway';
import {
    IAlertProvider,
    AlertProviderType,
    AlertPayload,
    AlertSeverity,
    PagerDutyEventPayload,
} from '../interfaces/alert.interfaces';

// ---------------------------------------------------------------------------
// PagerDuty Events API v2 Constants
// ---------------------------------------------------------------------------

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

// ---------------------------------------------------------------------------
// PagerDuty Alert Provider
// ---------------------------------------------------------------------------

/**
 * PagerDutyAlertProvider — Triggers incidents via PagerDuty Events API v2.
 *
 * ARCHITECTURE:
 * - HTTP POST to PagerDuty Events API v2 endpoint
 * - Uses `dedup_key` (projectId:sprintId) to prevent duplicate incidents
 * - Wrapped in IntegrationGateway circuit breaker for resilience
 * - Only triggers for CRITICAL alerts (score > 80)
 *
 * SECRET MANAGEMENT:
 * Routing key loaded from ConfigService. Never hardcoded.
 */
@Injectable()
export class PagerDutyAlertProvider implements IAlertProvider {
    readonly type = AlertProviderType.PAGERDUTY;
    private readonly logger = new Logger(PagerDutyAlertProvider.name);

    private readonly routingKey: string | undefined;

    constructor(
        private readonly configService: ConfigService,
        private readonly gateway: IntegrationGateway,
    ) {
        this.routingKey = this.configService.get<string>(
            'PAGERDUTY_ROUTING_KEY',
        );

        if (!this.routingKey) {
            this.logger.warn(
                'PAGERDUTY_ROUTING_KEY not configured — PagerDuty alerts disabled',
            );
        } else {
            this.logger.log('PagerDuty alert provider initialized');
        }
    }

    isEnabled(): boolean {
        return !!this.routingKey;
    }

    /**
     * Trigger a PagerDuty incident via Events API v2.
     *
     * DEDUPLICATION:
     * `dedup_key` = `zenith-risk:{projectId}:{sprintId}`.
     * PagerDuty uses this to group events into a single incident —
     * even if BullMQ retries or the cron fires again, PagerDuty won't
     * create duplicate incidents for the same sprint.
     *
     * CIRCUIT BREAKER: Same opossum protection as Slack provider.
     */
    async sendAlert(payload: AlertPayload): Promise<void> {
        if (!this.routingKey) {
            this.logger.debug('PagerDuty alerts disabled — skipping');
            return;
        }

        const pdPayload = this.formatPayload(payload);

        await this.gateway.execute(
            {
                name: 'pagerduty-alerts',
                timeout: 5000,
                errorThresholdPercentage: 50,
                resetTimeout: 30000,
            },
            async () => {
                const response = await fetch(PAGERDUTY_EVENTS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pdPayload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `PagerDuty API failed (${response.status}): ${errorText}`,
                    );
                }

                this.logger.log(
                    `PagerDuty incident triggered for project ${payload.projectId}`,
                );
            },
            () => {
                this.logger.warn(
                    `PagerDuty circuit breaker OPEN — alert dropped for project ${payload.projectId}`,
                );
            },
        );
    }

    // ---------------------------------------------------------------------------
    // PagerDuty Events API v2 Formatting
    // ---------------------------------------------------------------------------

    private formatPayload(payload: AlertPayload): PagerDutyEventPayload {
        return {
            routing_key: this.routingKey as string,
            event_action: 'trigger',
            dedup_key: `zenith-risk:${payload.projectId}:${payload.sprintId ?? 'global'}`,
            payload: {
                summary: `[Zenith] ${payload.title} — Risk Score: ${payload.metricValue}/100`,
                source: 'zenith-analytics',
                severity: this.mapSeverity(payload.severity),
                component: 'sprint-risk',
                group: payload.projectName,
                custom_details: {
                    projectId: payload.projectId,
                    projectName: payload.projectName,
                    organizationId: payload.organizationId,
                    metricValue: payload.metricValue,
                    threshold: payload.threshold,
                    sprintId: payload.sprintId,
                    sprintName: payload.sprintName,
                },
            },
        };
    }

    private mapSeverity(severity: AlertSeverity): 'info' | 'warning' | 'error' | 'critical' {
        switch (severity) {
            case AlertSeverity.CRITICAL:
                return 'critical';
            case AlertSeverity.WARNING:
                return 'warning';
            case AlertSeverity.INFO:
                return 'info';
        }
    }
}
