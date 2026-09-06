// src/notifications/ports/email-transport.port.ts
/**
 * Outbound port for email-channel notification delivery — a FORWARD SEAM.
 *
 * Notifications has no email path today (WebSocket-only). This port + its
 * `EmailNotificationAdapter` binding (Step 2, wrapping the `email` module's
 * `EmailService`) exist purely so the future delivery-fallback story — e.g.
 * the gateway's currently-unwired `sendToUserWithAck` "queue fallback" branch
 * — can be built WITHOUT re-opening the sealed module.
 *
 * INTENTIONALLY UNWIRED (YAGNI): no caller injects this in this refactor. A
 * bound-but-unconsumed provider is legal and emits no lint error. Do not add a
 * delivery flow here without a separate, scoped change.
 */
export abstract class EmailTransportPort {
  abstract sendNotificationEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void>;
}
