import { IsUUID, IsNotEmpty } from 'class-validator';

// =============================================================================
// HEARTBEAT DTO
// =============================================================================

/**
 * Strictly validated payload for the telemetry heartbeat endpoint.
 *
 * SECURITY:
 * - All fields use @IsUUID('4') — only cryptographically valid v4 UUIDs accepted
 * - Combined with ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
 *   any extra properties are rejected with 400 Bad Request
 * - Prevents BullMQ queue poisoning by ensuring only known, validated fields
 *   reach the worker
 *
 * USAGE:
 * This DTO is consumed by:
 * 1. TelemetryController (input validation)
 * 2. TelemetryService (typed queue dispatch)
 * 3. TelemetryProcessor (typed job.data consumption)
 */
export class HeartbeatDto {
  /**
   * The issue/ticket the user is currently working on.
   * Used to track active time and auto-transition to "In Progress".
   */
  @IsNotEmpty()
  @IsUUID('4')
  ticketId: string;

  /**
   * The project context for the ticket.
   * Required for IssuesService lookups and status transitions.
   */
  @IsNotEmpty()
  @IsUUID('4')
  projectId: string;

  /**
   * The authenticated user sending the heartbeat.
   * Used to scope the Redis session key and authorize status changes.
   */
  @IsNotEmpty()
  @IsUUID('4')
  userId: string;
}
