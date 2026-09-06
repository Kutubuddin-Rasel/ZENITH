// src/notifications/ports/realtime-transport.port.ts
/**
 * Outbound port for real-time (WebSocket) notification delivery.
 *
 * The god-class `NotificationsService` injected the CONCRETE
 * `NotificationsGateway` and emitted Socket.io frames inline inside its
 * persistence methods (transport leakage). The CQRS command/router service
 * depends on THIS abstraction instead — mirroring the `IssueBroadcastPort`
 * inversion in the gateways module.
 *
 * Bound `useExisting: NotificationsGateway` in Step 2 (the gateway already
 * implements all three methods, so it simply `extends RealtimeTransportPort`).
 * The gateway stays physically inside the notifications module; only the
 * dependency direction is inverted (DIP), so a future relocation to the
 * @Global GatewaysModule needs no caller changes.
 */
export abstract class RealtimeTransportPort {
  /** Fire-and-forget push to a user's room (`user:<id>`). */
  abstract sendToUser(userId: string, payload: unknown): void;

  /** Notify a user that notifications were removed (inbox sync). */
  abstract sendDeletionToUser(userId: string, notificationIds: string[]): void;

  /** Notify a user that a notification was updated in place. */
  abstract sendUpdateToUser(userId: string, payload: unknown): void;
}
