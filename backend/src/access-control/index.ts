/**
 * Access-Control Module — Public Barrel (SEALED, Step 3)
 *
 * STRICT BOUNDARY: only the NestJS module class, the `AccessControlGuard`
 * transport class, the 13 ISP tokens, the role-based abstract contracts
 * (ports), the value types / commands, the event-bus payloads, and the
 * domain enums are exported. Concrete services, repositories, the TypeORM
 * entities, the HTTP controller, DTOs, validators, the config service, and
 * the cleanup cron are module-internal and must be consumed exclusively
 * through the abstractions + tokens declared here.
 *
 * The abstract `IClientIpResolver` + `CLIENT_IP_RESOLVER_TOKEN` cover all
 * external IP-resolution use; `IpResolutionService` is NOT exported.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `access-control.controller`        → HTTP transport — owned by Nest,
 *                                          never injected by other modules.
 *  - `services/*`                        → bound behind the ISP tokens
 *                                          (`ACCESS_*_TOKEN`) and abstract
 *                                          ports; never injected as concrete
 *                                          classes. The legacy 1447-line
 *                                          `AccessControlService` god-class was
 *                                          deleted in Step 2.
 *  - `services/ip-resolution.service`    → reached via `IClientIpResolver` /
 *                                          `CLIENT_IP_RESOLVER_TOKEN` only.
 *  - `config/access-control-config`      → bound behind `IAccessControlConfig`.
 *  - `entities/*`                        → TypeORM persistence detail; the
 *                                          domain enums below are the public
 *                                          slice. The entity rows themselves
 *                                          do not cross this boundary.
 *  - `repositories/*`                    → DIP boundary lives inside the module;
 *                                          the abstract repository classes are
 *                                          the sole binding seam, not exported.
 *  - `dto/*`, `validators/*`             → HTTP input shapes; consumers depend
 *                                          on the structural `AccessRuleCreateCommand`
 *                                          / `AccessRuleUpdateCommand` types instead.
 *
 * BOUNDARY SWEEP (post-Step-3 invariant): a recursive grep for any import
 * that reaches a path INSIDE `access-control/` (i.e. anything other than the
 * bare `access-control` barrel) from outside this directory MUST return zero
 * matches. The deep-import to `services/ip-resolution.service` was the last
 * such leak and was rewired to `IClientIpResolver` in Step 3.
 */

export { AccessControlModule } from './access-control.module';
export { AccessControlGuard } from './guards/access-control.guard';

// ISP tokens + role-based abstract ports + value types / commands.
export * from './constants/access-control.tokens';
export * from './interfaces/access-control.interfaces';

// Event-bus contract (payload schema is part of the public surface).
export * from './constants/access-control.events';

// Domain enums — the public slice of the persistence entities.
export {
  AccessRuleType,
  AccessRuleStatus,
  IPType,
} from './entities/ip-access-rule.entity';
export { HistoryAction } from './entities/access-rule-history.entity';
