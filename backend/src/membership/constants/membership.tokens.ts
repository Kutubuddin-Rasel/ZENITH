/**
 * Membership Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the membership module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo.
 *
 * Convention
 * ----------
 *  - `PROJECT_MEMBER_*_TOKEN` → interfaces owned by membership.
 *
 * The repository abstraction (`AbstractProjectMemberRepository`) is
 * intentionally NOT represented here — per the RBAC reference pattern,
 * abstract classes double as their own DI tokens in NestJS, so the
 * repository binding uses the abstract class directly rather than a
 * separate symbol.
 *
 * Outbound ports consumed by RBAC (e.g.,
 * `MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN`) are defined in
 * `rbac/constants/rbac.tokens.ts` because RBAC owns the contract —
 * membership only binds the adapter.
 */

// Internal service surfaces ---------------------------------------------------

export const PROJECT_MEMBER_QUERY_TOKEN = Symbol('PROJECT_MEMBER_QUERY_TOKEN');
export const PROJECT_MEMBER_COMMAND_TOKEN = Symbol(
  'PROJECT_MEMBER_COMMAND_TOKEN',
);
export const PROJECT_MEMBER_POLICY_TOKEN = Symbol(
  'PROJECT_MEMBER_POLICY_TOKEN',
);
