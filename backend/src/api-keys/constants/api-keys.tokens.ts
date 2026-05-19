/**
 * API Keys Module — Dependency Injection Tokens (Step 1)
 *
 * Every cross-class binding inside (and into) the api-keys module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo.
 *
 * Convention
 * ----------
 *  - `API_KEY_*_TOKEN` → interfaces owned by the api-keys module.
 *
 * The repository abstraction (`AbstractApiKeyRepository`, introduced
 * in Step 2) is intentionally NOT represented here — per the
 * invites / membership reference pattern, abstract classes double as
 * their own DI tokens in NestJS, so the repository binding uses the
 * abstract class directly rather than a separate symbol.
 *
 * Token-to-interface mapping (defined in
 * `interfaces/api-keys.interfaces.ts`):
 *
 *   API_KEY_COMMAND_TOKEN   → IApiKeyCommand
 *   API_KEY_QUERY_TOKEN     → IApiKeyQuery
 *   API_KEY_VALIDATOR_TOKEN → IApiKeyValidator
 *   API_KEY_CRYPTO_TOKEN    → IApiKeyCryptoService
 *   API_KEY_POLICY_TOKEN    → IApiKeyPolicy
 *   API_KEY_AUDIT_TOKEN     → IApiKeyAuditLogger
 */

export const API_KEY_COMMAND_TOKEN = Symbol('API_KEY_COMMAND_TOKEN');
export const API_KEY_QUERY_TOKEN = Symbol('API_KEY_QUERY_TOKEN');
export const API_KEY_VALIDATOR_TOKEN = Symbol('API_KEY_VALIDATOR_TOKEN');
export const API_KEY_CRYPTO_TOKEN = Symbol('API_KEY_CRYPTO_TOKEN');
export const API_KEY_POLICY_TOKEN = Symbol('API_KEY_POLICY_TOKEN');
export const API_KEY_AUDIT_TOKEN = Symbol('API_KEY_AUDIT_TOKEN');

export type ApiKeyCommandToken = typeof API_KEY_COMMAND_TOKEN;
export type ApiKeyQueryToken = typeof API_KEY_QUERY_TOKEN;
export type ApiKeyValidatorToken = typeof API_KEY_VALIDATOR_TOKEN;
export type ApiKeyCryptoToken = typeof API_KEY_CRYPTO_TOKEN;
export type ApiKeyPolicyToken = typeof API_KEY_POLICY_TOKEN;
export type ApiKeyAuditToken = typeof API_KEY_AUDIT_TOKEN;
