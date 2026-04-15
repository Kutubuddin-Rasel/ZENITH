/**
 * Purge Admin API — DTOs & Response Interfaces
 *
 * ARCHITECTURE:
 * Strict typed DTOs for the PurgeController endpoints.
 * All inputs validated via class-validator decorators.
 * All responses are readonly interfaces — no mutation after creation.
 *
 * ZERO `any` / ZERO `unknown` — strict typing only.
 *
 * @see PurgeController for endpoint definitions
 * @see PurgeAdminService for business logic
 */

import { IsUUID, IsString } from 'class-validator';
import { PurgeResult } from './purge.constants';

// =============================================================================
// REQUEST DTOs (class-validator)
// =============================================================================

/**
 * Path parameter DTO for `POST /scheduled-tasks/purge/:projectId`.
 *
 * Validates that projectId is a UUID v4 — prevents SQL injection
 * and malformed IDs before they reach the service layer.
 */
export class PurgeProjectParamDto {
  @IsUUID('4', { message: 'projectId must be a valid UUID v4' })
  projectId: string;
}

/**
 * Path parameter DTO for `GET /scheduled-tasks/purge/status/:jobId`.
 *
 * BullMQ job IDs are typically numeric strings or custom UUIDs.
 * We validate as non-empty string (not UUID) because BullMQ
 * auto-generates numeric IDs for repeatable jobs.
 */
export class PurgeJobStatusParamDto {
  @IsString({ message: 'jobId must be a string' })
  jobId: string;
}

// =============================================================================
// RESPONSE INTERFACES (readonly)
// =============================================================================

/**
 * Response from `POST /scheduled-tasks/purge/:projectId`.
 *
 * Returns 202 Accepted with the BullMQ job ID for async status polling.
 * The purge runs asynchronously — admin polls GET /status/:jobId.
 */
export interface ManualPurgeResponse {
  readonly jobId: string;
  readonly status: 'queued';
  readonly message: string;
}

/**
 * BullMQ job states that we expose via the status endpoint.
 *
 * We define our own union rather than importing BullMQ's `JobState`
 * to avoid leaking internal BullMQ types into the API contract.
 */
export type PurgeJobState =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'unknown';

/**
 * Response from `GET /scheduled-tasks/purge/status/:jobId`.
 *
 * - `results` is present ONLY when status === 'completed'
 * - `error` is present ONLY when status === 'failed'
 * - During 'waiting' or 'active', only jobId + status are returned
 */
export interface PurgeStatusResponse {
  readonly jobId: string;
  readonly status: PurgeJobState;
  /** Purge results per project — only present when status === 'completed' */
  readonly results?: ReadonlyArray<PurgeResult>;
  /** Failure reason — only present when status === 'failed' */
  readonly error?: string;
}
