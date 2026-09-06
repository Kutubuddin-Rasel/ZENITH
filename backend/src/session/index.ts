/**
 * Session Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only the NestJS module class, the `SessionInterceptor`
 * transport class, the 9 ISP tokens, the role-based abstract contracts
 * (ports), the value types, and the domain enums are exported. Concrete
 * services, repositories, the TypeORM entity, the HTTP controller, DTOs, the
 * config service, and the secure-connection transport util are module-internal
 * and must be consumed exclusively through the abstractions + tokens here.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `session.controller`            → HTTP transport — owned by Nest, never
 *                                       injected by other modules.
 *  - `services/*`                    → bound behind the ISP tokens
 *                                       (`SESSION_*_TOKEN`) and abstract ports;
 *                                       never injected as concrete classes. The
 *                                       legacy 656-line `SessionService`
 *                                       god-class was deleted in Step 3.
 *  - `config/session.config`         → bound behind `ISessionConfig`.
 *  - `entities/session.entity`       → TypeORM persistence detail; the domain
 *                                       enums below are the public slice. The
 *                                       entity rows do not cross this boundary.
 *  - `repositories/*`                → DIP boundary lives inside the module; the
 *                                       abstract `ISessionStore` /
 *                                       `ISessionUserLookup` ports are the sole
 *                                       binding seam, not exported as concretes.
 *  - `utils/secure-connection.util`  → transport concern; the controller
 *                                       resolves `isSecure` and passes it as
 *                                       plain data on `CreateSessionData`.
 *  - `dto/*`                         → HTTP input shapes; consumers depend on
 *                                       the structural `CreateSessionData` type.
 *
 * BOUNDARY SWEEP (post-Step-4 invariant): a recursive grep for any import that
 * reaches a path INSIDE `session/` (i.e. anything other than the bare `session`
 * barrel) from outside this directory MUST return zero matches. The
 * `app.module` deep-import to `./session/session.module` was the last such leak
 * and was rewired to `./session` in Step 4.
 */

export { SessionModule } from './session.module';
export { SessionInterceptor } from './interceptors/session.interceptor';

// ISP tokens + role-based abstract ports + value types.
export * from './constants/session.tokens';
export * from './interfaces/session.interfaces';

// Domain enums — the public slice of the persistence entity.
export { SessionStatus, SessionType } from './entities/session.entity';
