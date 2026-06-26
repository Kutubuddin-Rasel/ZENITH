/**
 * UnsafeManagerGate — friction-based escape hatch.
 *
 * Hands out the underlying TypeORM `EntityManager` (which bypasses
 * every tenant filter) only when the caller supplies a written
 * justification. The justification is logged at WARN level so the
 * bypass leaves an audit trail in the application logs in addition to
 * the visible call-site comment that the API forces developers to
 * write.
 *
 * Intentionally has no dependency on the tenant context — the gate is
 * about discipline, not authorisation.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager, ObjectLiteral, Repository } from 'typeorm';

@Injectable()
export class UnsafeManagerGate {
  private readonly logger = new Logger(UnsafeManagerGate.name);

  /**
   * @param repository - The repository whose `EntityManager` will be
   *                     surfaced to the caller.
   * @param reason     - Non-empty written justification. Logged on
   *                     every access. Empty / whitespace strings are
   *                     rejected to prevent silent bypasses.
   */
  getUnsafeManager<T extends ObjectLiteral>(
    repository: Repository<T>,
    reason: string,
  ): EntityManager {
    if (!reason || reason.trim().length === 0) {
      throw new Error(
        'getUnsafeManager requires a non-empty reason explaining why tenant bypass is needed',
      );
    }

    this.logger.warn(
      `UNSAFE EntityManager accessed - TENANT ISOLATION BYPASSED. Reason: "${reason}"`,
    );

    return repository.manager;
  }
}
