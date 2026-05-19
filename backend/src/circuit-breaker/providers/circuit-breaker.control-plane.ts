import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  CIRCUIT_AUDIT_LOGGER_TOKEN,
  PERMISSION_CHECKER_TOKEN,
} from '../constants/circuit-breaker.tokens';
import type {
  CircuitAuditContext,
  ICircuitAuditLogger,
  ICircuitBreakerControlPlane,
  IPermissionChecker,
} from '../interfaces/circuit-breaker.interfaces';
import { CircuitBreakerOrchestrator } from './circuit-breaker.orchestrator';

/**
 * Circuit-breaker management permission constants.
 *
 * Format follows the RBAC convention: "resource:action". Single source
 * of truth — every trip/reset call funnels through `MANAGE` below.
 */
export const CircuitBreakerPermissions = {
  MANAGE: 'circuit-breaker:manage',
} as const;

export type CircuitBreakerPermission =
  (typeof CircuitBreakerPermissions)[keyof typeof CircuitBreakerPermissions];

/**
 * CircuitBreakerControlPlane
 *
 * SRP: implements the manual operational override surface
 * (`ICircuitBreakerControlPlane`). Owns authorization and audit-logging
 * concerns for trip/reset; delegates raw breaker mutation to the
 * orchestrator (composition, not inheritance).
 *
 * SECURITY (defense-in-depth): permission check fires at the service
 * layer regardless of transport — HTTP guard alone is insufficient.
 */
@Injectable()
export class CircuitBreakerControlPlane implements ICircuitBreakerControlPlane {
  private readonly logger = new Logger(CircuitBreakerControlPlane.name);

  constructor(
    private readonly orchestrator: CircuitBreakerOrchestrator,
    @Optional()
    @Inject(CIRCUIT_AUDIT_LOGGER_TOKEN)
    private readonly auditLogger?: ICircuitAuditLogger,
    @Optional()
    @Inject(PERMISSION_CHECKER_TOKEN)
    private readonly permissionChecker?: IPermissionChecker,
  ) {}

  async tripBreaker(
    name: string,
    context: CircuitAuditContext,
  ): Promise<boolean> {
    await this.checkPermission(context);

    const breaker = this.orchestrator.getBreakerHandle(name);
    if (!breaker) {
      this.logger.warn(`Trip failed: breaker '${name}' not found`);
      return false;
    }

    breaker.open();
    this.logger.warn(`Circuit manually tripped: ${name} by ${context.userId}`);

    await this.auditLogger?.logTrip(name, context, {
      previousState: 'CLOSED',
      newState: 'OPEN',
    });

    return true;
  }

  async resetBreaker(
    name: string,
    context: CircuitAuditContext,
  ): Promise<boolean> {
    await this.checkPermission(context);

    const breaker = this.orchestrator.getBreakerHandle(name);
    if (!breaker) {
      this.logger.warn(`Reset failed: breaker '${name}' not found`);
      return false;
    }

    const previousState = this.orchestrator.snapshotState(breaker);

    breaker.close();
    this.logger.log(`Circuit manually reset: ${name} by ${context.userId}`);

    await this.auditLogger?.logReset(name, context, {
      previousState,
      newState: 'CLOSED',
    });

    return true;
  }

  private async checkPermission(context: CircuitAuditContext): Promise<void> {
    if (!this.permissionChecker) {
      this.logger.debug(
        'PermissionChecker not available, skipping permission check',
      );
      return;
    }

    const required = CircuitBreakerPermissions.MANAGE;

    try {
      const granted = await this.permissionChecker.hasPermission(
        context.principalId,
        required,
      );

      if (!granted) {
        this.logger.warn(
          `Authorization denied: User ${context.userId} (principal: ${context.principalId}) ` +
            `lacks permission '${required}'`,
        );
        throw new ForbiddenException(
          `Permission denied: requires '${required}'`,
        );
      }

      this.logger.debug(
        `Authorization granted: User ${context.userId} has '${required}'`,
      );
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        'Permission check failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new ForbiddenException('Permission check failed');
    }
  }
}
