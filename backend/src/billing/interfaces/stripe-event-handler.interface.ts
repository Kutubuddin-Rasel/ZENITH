/**
 * IStripeEventHandler — Strategy Pattern for Stripe Event Dispatch.
 *
 * OCP FIX: Replaces the monolithic switch statement in dispatchEvent().
 * Each handler is a standalone class that handles one Stripe event type.
 * New events are added by creating a new handler — no existing code modified.
 *
 * @see SOLID_STANDARDS.md — OCP: "No massive switch statements for
 *      core business rules. Use Strategy/Handler patterns."
 */

import Stripe from 'stripe';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Contract for a Stripe webhook event handler.
 * Each handler processes exactly one event type.
 */
export interface IStripeEventHandler {
  /**
   * The Stripe event type this handler processes.
   * e.g., 'customer.subscription.updated'
   */
  readonly eventType: string;

  /**
   * Handle the Stripe event.
   *
   * @param event - The full Stripe event (for accessing data.object)
   * @param org - The resolved organization (already looked up by customer ID)
   * @param eventId - Stripe event ID for audit logging
   */
  handle(
    event: Stripe.Event,
    org: Organization,
    eventId: string,
  ): Promise<void>;
}
