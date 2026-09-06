import { Injectable } from '@nestjs/common';
import type { IResponseOptimizer } from '../interfaces/performance.interfaces';

/**
 * ResponseOptimizerService — Payload Optimization.
 *
 * SRP: Owns response payload optimization by recursively stripping
 * null/undefined values from objects and arrays. Pure logic —
 * no external dependencies.
 */
@Injectable()
export class ResponseOptimizerService implements IResponseOptimizer {
  /**
   * Optimize response data by removing null/undefined values.
   *
   * TYPE SAFETY (Phase 5):
   * Uses generic <T> to preserve the input type through the transformation.
   * The caller's specific interface is maintained in the return type.
   *
   * @param data - Input data of type T
   * @returns Optimized data with nulls removed, typed as T
   */
  optimizeResponseData<T>(data: T): T {
    if (!data) return data;

    // Handle arrays — filter null/undefined items
    if (Array.isArray(data)) {
      return data.filter(
        (item): item is NonNullable<(typeof data)[number]> =>
          item !== null && item !== undefined,
      ) as T;
    }

    // Handle objects — recursively remove null/undefined values
    if (typeof data === 'object' && data !== null) {
      const optimized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (value !== null && value !== undefined) {
          optimized[key] = this.optimizeResponseData(value);
        }
      }
      return optimized as T;
    }

    // Primitive types pass through unchanged
    return data;
  }
}
