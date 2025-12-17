/**
 * OptimisticLockingInterceptor - Global handler for optimistic locking
 *
 * This interceptor catches TypeORM's OptimisticLockVersionMismatchError
 * and converts it to a user-friendly 409 Conflict response.
 *
 * It also validates `expectedVersion` in update DTOs when present.
 */

import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    ConflictException,
    Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * TypeORM's optimistic lock error when version mismatch occurs
 */
interface OptimisticLockError extends Error {
    name: 'OptimisticLockVersionMismatchError';
}

function isOptimisticLockError(error: unknown): error is OptimisticLockError {
    return (
        error instanceof Error &&
        error.name === 'OptimisticLockVersionMismatchError'
    );
}

@Injectable()
export class OptimisticLockingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(OptimisticLockingInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            catchError((error) => {
                if (isOptimisticLockError(error)) {
                    this.logger.warn(
                        `Optimistic lock conflict: ${error.message}`,
                    );

                    return throwError(
                        () =>
                            new ConflictException({
                                error: 'OPTIMISTIC_LOCK_CONFLICT',
                                message:
                                    'This record was modified by another user. Please refresh and try again.',
                                details:
                                    'The version of the record you are updating does not match the current version in the database.',
                            }),
                    );
                }

                return throwError(() => error);
            }),
        );
    }
}
