/**
 * Alert Interfaces & Payload Types
 *
 * STRICT TYPING: Zero `any`. All payloads have explicit interfaces.
 * These types flow through the entire alerting pipeline:
 * Service → BullMQ Job → Processor → Provider → External API
 */

// ---------------------------------------------------------------------------
// Core Alert Types
// ---------------------------------------------------------------------------

/** Severity levels for alert routing */
export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    CRITICAL = 'critical',
}

/** The standardized alert payload dispatched to BullMQ */
export interface AlertPayload {
    /** Which project triggered the alert */
    projectId: string;
    /** Project name for display */
    projectName: string;
    /** Organization ID for audit/routing */
    organizationId: string;
    /** Alert severity determines routing (PagerDuty for critical, Slack for all) */
    severity: AlertSeverity;
    /** Human-readable alert title */
    title: string;
    /** Detailed message body */
    message: string;
    /** Metric value that triggered the alert */
    metricValue: number;
    /** Threshold that was exceeded */
    threshold: number;
    /** Optional sprint context */
    sprintId?: string;
    /** Optional sprint name */
    sprintName?: string;
}

/** BullMQ job data wrapping the alert payload */
export interface AlertJobData {
    /** Which providers to target */
    providers: AlertProviderType[];
    /** The alert payload */
    payload: AlertPayload;
    /** ISO timestamp of when the job was created */
    createdAt: string;
}

/** Supported alert provider types */
export enum AlertProviderType {
    SLACK = 'slack',
    PAGERDUTY = 'pagerduty',
}

// ---------------------------------------------------------------------------
// Provider Interface (Strategy Pattern)
// ---------------------------------------------------------------------------

/**
 * IAlertProvider — All alert providers must implement this interface.
 *
 * STRATEGY PATTERN:
 * The AlertingService holds a Map<AlertProviderType, IAlertProvider>.
 * Each provider formats the payload for its target API and sends it.
 * Adding a new provider (Teams, Discord, etc.) requires only a new
 * implementation — zero changes to AlertingService.
 */
export interface IAlertProvider {
    /** Provider type identifier */
    readonly type: AlertProviderType;

    /** Whether this provider is configured and operational */
    isEnabled(): boolean;

    /**
     * Send an alert to the external platform.
     * Throws on failure — BullMQ handles retries.
     */
    sendAlert(payload: AlertPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// Slack Webhook Payload (Block Kit)
// ---------------------------------------------------------------------------

/** Slack Block Kit text object */
interface SlackTextObject {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
}

/** Slack Block Kit section block */
interface SlackSectionBlock {
    type: 'section';
    text?: SlackTextObject;
    fields?: SlackTextObject[];
}

/** Slack Block Kit header block */
interface SlackHeaderBlock {
    type: 'header';
    text: SlackTextObject;
}

/** Slack Block Kit divider */
interface SlackDividerBlock {
    type: 'divider';
}

/** Union of supported Slack block types */
type SlackBlock = SlackSectionBlock | SlackHeaderBlock | SlackDividerBlock;

/** Complete Slack Incoming Webhook payload */
export interface SlackWebhookPayload {
    text: string; // Fallback text for notifications
    blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// PagerDuty Events API v2 Payload
// ---------------------------------------------------------------------------

/** PagerDuty event action */
type PagerDutyAction = 'trigger' | 'acknowledge' | 'resolve';

/** PagerDuty severity mapping */
type PagerDutySeverity = 'info' | 'warning' | 'error' | 'critical';

/** PagerDuty custom details (strongly typed for our use case) */
interface PagerDutyCustomDetails {
    projectId: string;
    projectName: string;
    organizationId: string;
    metricValue: number;
    threshold: number;
    sprintId?: string;
    sprintName?: string;
}

/** PagerDuty Events API v2 payload */
export interface PagerDutyEventPayload {
    routing_key: string;
    event_action: PagerDutyAction;
    dedup_key: string; // Prevents duplicate incidents
    payload: {
        summary: string;
        source: string;
        severity: PagerDutySeverity;
        component: string;
        group: string;
        custom_details: PagerDutyCustomDetails;
    };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ queue name — used by @InjectQueue and @Processor */
export const ALERTS_QUEUE = 'alerts-queue' as const;

/** Redis key prefix for alert debounce locks */
export const ALERT_LOCK_PREFIX = 'alert_sent_lock' as const;

/** Debounce TTL in seconds (24 hours) */
export const ALERT_DEBOUNCE_TTL_SECONDS = 86_400;

/** Risk score threshold for triggering alerts (80%) */
export const RISK_ALERT_THRESHOLD = 80;
