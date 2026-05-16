/**
 * Alerting Service Contracts (common Module — DIP/ISP/OCP foundation).
 *
 * Establishes the Strategy Pattern for multi-channel alert delivery and
 * segregates the distributed failure-counter surface from the dispatcher.
 * Concrete providers live in `../services/alerting/` and are bound to
 * the tokens in `../constants/alerting.tokens.ts`.
 *
 * Channel transports plug in via `IAlertChannel` — adding a new transport
 * (Teams, OpsGenie, etc.) requires zero modification to the dispatcher (OCP).
 */

/**
 * Alert severity levels for multi-channel routing.
 * Defined here as the canonical home — the alerting contract has no
 * dependency on any single dispatcher implementation.
 */
export enum AlertSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Standardized alert payload accepted by every channel.
 * `context` is `Record<string, unknown>` — never `any`.
 */
export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

/**
 * IAlertChannel — Strategy contract for a single alert transport.
 *
 *  - `name` is a stable identifier used in dispatcher logs.
 *  - `severityFilter` is the set of severities this channel will deliver.
 *    The dispatcher consults it BEFORE invoking `send`, so channels do
 *    not need to re-check severity internally.
 *  - `send` MUST reject on transport failure so the dispatcher's
 *    `Promise.allSettled` can record per-channel failure rates.
 */
export interface IAlertChannel {
  readonly name: string;
  readonly severityFilter: ReadonlyArray<AlertSeverity>;
  send(payload: AlertPayload): Promise<void>;
}

/**
 * IFailureTracker — distributed sync-failure counter surface.
 * Implemented on top of `ICacheCounter` + `ICacheStore` (Redis-backed).
 */
export interface IFailureTracker {
  recordFailure(integrationId: string): Promise<number>;
  recordSuccess(integrationId: string): Promise<void>;
  getCount(integrationId: string): Promise<number>;
}

/**
 * IAlertDispatcher — fire-and-forget multi-channel fan-out surface.
 * Implementations MUST filter channels by severity, fan out via
 * `Promise.allSettled`, and never propagate transport errors.
 */
export interface IAlertDispatcher {
  dispatch(payload: AlertPayload): void;
}
