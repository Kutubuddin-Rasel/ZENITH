/**
 * Invites Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the invites module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo.
 *
 * Convention
 * ----------
 *  - `INVITE_*_TOKEN` → interfaces owned by the invites module.
 *
 * The repository abstraction (`AbstractInviteRepository`, introduced
 * in Step 2) is intentionally NOT represented here — per the
 * RBAC / membership reference pattern, abstract classes double as
 * their own DI tokens in NestJS, so the repository binding uses the
 * abstract class directly rather than a separate symbol.
 *
 * Outbound ports (e.g., `ProjectLookupPort`) live under `ports/`
 * because the invites module OWNS the contract; the adapter is bound
 * externally inside `ProjectsModule`, mirroring how membership binds
 * the `MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN` adapter for RBAC.
 */

// Internal service surfaces ---------------------------------------------------

export const INVITE_QUERY_TOKEN = Symbol('INVITE_QUERY_TOKEN');
export const INVITE_COMMAND_TOKEN = Symbol('INVITE_COMMAND_TOKEN');
export const INVITE_POLICY_TOKEN = Symbol('INVITE_POLICY_TOKEN');
export const INVITE_TOKEN_GENERATOR_TOKEN = Symbol(
  'INVITE_TOKEN_GENERATOR_TOKEN',
);

export type InviteQueryToken = typeof INVITE_QUERY_TOKEN;
export type InviteCommandToken = typeof INVITE_COMMAND_TOKEN;
export type InvitePolicyToken = typeof INVITE_POLICY_TOKEN;
export type InviteTokenGeneratorToken = typeof INVITE_TOKEN_GENERATOR_TOKEN;
