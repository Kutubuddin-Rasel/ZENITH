/**
 * Auth DI Tokens.
 *
 * Symbol-based injection tokens for the segregated contracts in
 * `../interfaces/`. Symbols guarantee zero collision risk across the
 * application graph and prevent string-key drift.
 *
 * USAGE:
 *   constructor(
 *     @Inject(TOKEN_ISSUER_TOKEN) private readonly tokens: ITokenIssuer,
 *   ) {}
 *
 * @see SOLID_STANDARDS.md — DIP: "Define abstract interfaces or abstract
 *      classes as injection tokens, then bind concrete implementations via
 *      NestJS custom providers."
 */

// ── Core authentication ────────────────────────────────────────────────
export const AUTHENTICATOR_TOKEN: unique symbol = Symbol('AUTHENTICATOR_TOKEN');
export const CREDENTIAL_VALIDATOR_TOKEN: unique symbol = Symbol(
  'CREDENTIAL_VALIDATOR_TOKEN',
);
export const ACCOUNT_LOCKOUT_POLICY_TOKEN: unique symbol = Symbol(
  'ACCOUNT_LOCKOUT_POLICY_TOKEN',
);

// ── JWT token lifecycle ────────────────────────────────────────────────
export const TOKEN_ISSUER_TOKEN: unique symbol = Symbol('TOKEN_ISSUER_TOKEN');
export const TOKEN_VERIFIER_TOKEN: unique symbol = Symbol(
  'TOKEN_VERIFIER_TOKEN',
);
export const TOKEN_REVOKER_TOKEN: unique symbol = Symbol('TOKEN_REVOKER_TOKEN');

// ── SAML SSO ───────────────────────────────────────────────────────────
export const SAML_CONFIG_READER_TOKEN: unique symbol = Symbol(
  'SAML_CONFIG_READER_TOKEN',
);
export const SAML_CONFIG_WRITER_TOKEN: unique symbol = Symbol(
  'SAML_CONFIG_WRITER_TOKEN',
);
export const SAML_STRATEGY_FACTORY_TOKEN: unique symbol = Symbol(
  'SAML_STRATEGY_FACTORY_TOKEN',
);
export const SAML_IDENTITY_PROVISIONER_TOKEN: unique symbol = Symbol(
  'SAML_IDENTITY_PROVISIONER_TOKEN',
);

// ── Two-Factor Authentication ──────────────────────────────────────────
export const TWO_FACTOR_SECRET_STORE_TOKEN: unique symbol = Symbol(
  'TWO_FACTOR_SECRET_STORE_TOKEN',
);
export const TWO_FACTOR_VERIFIER_TOKEN: unique symbol = Symbol(
  'TWO_FACTOR_VERIFIER_TOKEN',
);
export const TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN: unique symbol = Symbol(
  'TWO_FACTOR_BACKUP_CODE_SERVICE_TOKEN',
);
export const TWO_FACTOR_RECOVERY_SERVICE_TOKEN: unique symbol = Symbol(
  'TWO_FACTOR_RECOVERY_SERVICE_TOKEN',
);
export const TWO_FACTOR_ADMIN_SERVICE_TOKEN: unique symbol = Symbol(
  'TWO_FACTOR_ADMIN_SERVICE_TOKEN',
);

// ── Cross-domain users-module adapter ─────────────────────────────────
export const AUTH_USER_READER_TOKEN: unique symbol = Symbol(
  'AUTH_USER_READER_TOKEN',
);
export const AUTH_USER_WRITER_TOKEN: unique symbol = Symbol(
  'AUTH_USER_WRITER_TOKEN',
);
