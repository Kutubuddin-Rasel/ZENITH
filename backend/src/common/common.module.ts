import { Module } from '@nestjs/common';
import { CommonAlertingModule } from './submodules/alerting.module';
import { CommonEventsModule } from './submodules/events.module';
import { CommonHttpModule } from './submodules/http.module';
import { CommonObservabilityModule } from './submodules/observability.module';
import { CommonSecurityModule } from './submodules/security.module';

/**
 * CommonModule — Transitional Barrel
 *
 * After the Step 3 SRP/DIP refactor, `CommonModule` is a thin barrel
 * over five focused submodules. The `@Global()` decorator and the
 * `Integration`-entity TypeORM registration have been removed — every
 * consumer must now explicitly `imports: [CommonModule]` (or, after
 * Step 4, the narrower submodule it actually needs).
 *
 *   - CommonSecurityModule       — encryption + throttling guards
 *   - CommonObservabilityModule  — Prometheus registry + 6 metric recorders
 *   - CommonAlertingModule       — multi-channel alert dispatcher (Strategy)
 *   - CommonHttpModule           — response shaping interceptors
 *   - CommonEventsModule         — segregated injectable event factories
 *
 * Step 4 will delete this barrel once all consumers import the focused
 * submodule directly.
 */
@Module({
  imports: [
    CommonSecurityModule,
    CommonObservabilityModule,
    CommonAlertingModule,
    CommonHttpModule,
    CommonEventsModule,
  ],
  exports: [
    CommonSecurityModule,
    CommonObservabilityModule,
    CommonAlertingModule,
    CommonHttpModule,
    CommonEventsModule,
  ],
})
export class CommonModule {}
