/**
 * Webhook Delivery Queue — Constants & Job Data Interface
 *
 * Used by:
 * - WebhooksService (producer): enqueues delivery jobs
 * - WebhookDeliveryProcessor (consumer): processes delivery jobs
 */

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export const WEBHOOK_DELIVERY_JOB = 'deliver';

export interface WebhookDeliveryJobData {
  /** ID of the webhook subscription to deliver to */
  webhookId: string;

  /** Event name, e.g. 'issue.created' */
  event: string;

  /** Event payload data (already serialized-safe) */
  payload: object;
}
