import { Module } from '@nestjs/common';
import { TransformInterceptor } from '../interceptors/transform.interceptor';

/**
 * CommonHttpModule
 *
 * SRP: Owns request/response shaping primitives — currently just the
 * generic `TransformInterceptor` (wraps responses in `ApiResponse<T>`).
 *
 * `ValidatorInterceptor` is intentionally NOT registered here: it is
 * instantiated per-route via the `createValidatorInterceptor(config)`
 * factory because each consumer needs its own `ValidationConfig`.
 */
@Module({
  providers: [TransformInterceptor],
  exports: [TransformInterceptor],
})
export class CommonHttpModule {}
