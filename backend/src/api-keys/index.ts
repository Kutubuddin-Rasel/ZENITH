/**
 * API Keys Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, ISP tokens, scope
 * vocabulary, event-bus payloads, the `RequireScopes` decorator, and
 * the `ApiKeyGuard` transport class are exported. Concrete services,
 * the TypeORM entity, the repository layer, the HTTP controller, the
 * cleanup cron, and the `ApiKeysModule` class itself are
 * module-internal and must be consumed exclusively through the tokens
 * declared in `constants/api-keys.tokens.ts`.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `api-keys.module`              → `app.module.ts` imports the
 *                                     class by direct path; no other
 *                                     module should.
 *  - `services/*`                   → bound behind the six ISP tokens
 *                                     (`API_KEY_*_TOKEN`); never
 *                                     injected as concrete classes.
 *                                     The legacy `ApiKeysService`
 *                                     god-class was deleted in Step 3.
 *  - `entities/api-key.entity`      → TypeORM persistence detail.
 *                                     `keyHash` lives on the entity
 *                                     and MUST NOT leak across this
 *                                     boundary; the public DTOs
 *                                     (`ApiKeySummary`,
 *                                     `ValidatedApiKey`,
 *                                     `ApiKeyCreateResult`,
 *                                     `ApiKeyRotateResult`) replace
 *                                     it.
 *  - `repositories/*`               → DIP boundary lives inside the
 *                                     module; the abstract repository
 *                                     class is the sole binding seam
 *                                     and is not re-exported.
 *  - `api-keys.controller`          → HTTP transport — owned by Nest,
 *                                     never injected by other modules.
 *  - `dto/*`, `validators/*`        → HTTP input shapes; consumers
 *                                     should depend on the structural
 *                                     `ApiKeyCreateCommand` /
 *                                     `ApiKeyUpdateCommand` /
 *                                     `ApiKeyRotateCommand`
 *                                     interfaces in
 *                                     `interfaces/api-keys.interfaces`
 *                                     instead.
 *
 * BOUNDARY SWEEP (post-Step-4 invariant):
 *   grep -rn "from.*api-keys/api-keys\.service\|from.*api-keys/entities\
 *           \|from.*api-keys/services\|from.*api-keys/repositories\
 *           \|@InjectRepository(ApiKey)" backend/src \
 *     | grep -v "^backend/src/api-keys/"
 *   → MUST return zero matches.
 */

export * from './interfaces/api-keys.interfaces';
export * from './constants/api-keys.tokens';
export * from './constants/api-scopes.constant';
export * from './events/api-keys-events';
export * from './decorators/require-scopes.decorator';
export { ApiKeyGuard } from './guards/api-key.guard';
