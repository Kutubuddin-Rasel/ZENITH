/**
 * Invites Module — Abstract Repository (DIP Boundary, Step 2)
 *
 * This is the ONLY allowed persistence contract for the `invites`
 * aggregate. Concrete implementations (`PostgresInviteRepository`)
 * own `@InjectRepository(Invite)` and `DataSource` exclusively — no
 * service, listener, or controller may inject the TypeORM repository
 * directly.
 *
 * Abstract-class-as-DI-token: NestJS resolves this binding by
 * reference identity on the class symbol, mirroring how
 * `AbstractProjectMemberRepository` is bound in the membership
 * module. There is therefore NO `INVITE_REPOSITORY_TOKEN` in
 * `constants/invites.tokens.ts` — the abstract class itself IS the
 * token.
 *
 * Return-type policy
 * ------------------
 * Methods return the raw `Invite` entity (not `InviteSummary`)
 * during Step 2 because `InvitesService` is still in transition and
 * mutates entity fields directly (`invite.status = …`,
 * `invite.respondedAt = …`). Step 3 introduces the
 * `InviteQueryService` which projects to `InviteSummary` /
 * `InviteWithRelations` DTOs at the read boundary; Step 3 also moves
 * the mutation work into `InviteCommandService`, which will continue
 * to round-trip through the entity inside this module while exposing
 * only DTOs across the public ISP surface.
 *
 * Transaction policy
 * ------------------
 * `bulkCreateInTransaction` is the ONLY transactional API. Callers
 * never see `DataSource` or `QueryRunner` — the repository owns the
 * full lifecycle (connect → start → commit/rollback → release) and
 * runs the per-row duplicate guard inside the transaction so the
 * read-modify-write window is closed against concurrent inserts.
 */

import type { Invite } from '../../entities/invite.entity';

/**
 * Pre-resolved bulk-invite entry. The service layer has already
 * resolved `email → inviteeId` (or fallen back to `inviteeEmail` for
 * the shadow-account flow) and pre-generated the token, so this
 * repository operates on a fully validated row description.
 *
 * `index` is the entry's position in the original public-API request
 * array — it is propagated back into `BulkInviteRepoResult.failed`
 * so partial-failure callers can attribute errors to the right input
 * row.
 */
export interface BulkInviteRepoEntry {
  readonly index: number;
  readonly inviteeId: string | null;
  readonly inviteeEmail: string | null;
  readonly role: string;
  readonly token: string;
  readonly expiresAt?: Date;
}

/**
 * Partial-success result returned by `bulkCreateInTransaction`.
 *
 * `failed[]` carries duplicate-guard rejections detected inside the
 * transaction. Pre-transaction failures (e.g., neither inviteeId nor
 * email supplied) are surfaced by the caller, not by this method.
 */
export interface BulkInviteRepoResult {
  readonly created: Invite[];
  readonly failed: Array<{ index: number; reason: string }>;
}

export abstract class AbstractInviteRepository {
  /** Resolve by primary key. Returns `null` if not found. */
  abstract findById(id: string): Promise<Invite | null>;

  /**
   * Resolve by the public opaque token. Must eager-load the
   * `invitee` relation — consumers (the redeem-invite flow) need it
   * to short-circuit when the invite already targets an existing
   * user.
   */
  abstract findByToken(token: string): Promise<Invite | null>;

  /**
   * Project-scoped list with `invitee` + `inviter` relations eagerly
   * loaded. Ordered newest-first.
   */
  abstract findForProject(projectId: string): Promise<Invite[]>;

  /**
   * Project-scoped list WITHOUT relations. Retained for binary
   * compatibility with the legacy `InvitesService.findByProject`
   * helper; current call sites prefer `findForProject`.
   */
  abstract findByProject(projectId: string): Promise<Invite[]>;

  /**
   * Return the most recent `Pending` invite for the supplied target.
   * Pass either `inviteeId` (resolved user) or `inviteeEmail`
   * (shadow account) — NEVER both. Used by the duplicate guard in
   * `createInvite`.
   */
  abstract findActivePending(
    projectId: string,
    target: { inviteeId?: string; inviteeEmail?: string },
  ): Promise<Invite | null>;

  /**
   * Persist a new or modified invite. Mirrors `Repository<Invite>.save`
   * semantics (insert-or-update by primary key).
   */
  abstract save(invite: Invite): Promise<Invite>;

  /**
   * Build a non-persisted entity from a partial payload. Mirrors
   * `Repository<Invite>.create` — exists so command-side services
   * never need direct access to the entity constructor.
   */
  abstract createEntity(data: Partial<Invite>): Invite;

  /**
   * Transactional bulk insert with per-row duplicate detection.
   *
   * Semantics:
   *  - Opens its own `QueryRunner`, runs the duplicate guard against
   *    `manager.findOne(Invite, …)` (so the read joins the write
   *    transaction), and persists via `manager.save(invite)`.
   *  - Per-row duplicates are collected into `failed[]` rather than
   *    aborting the transaction.
   *  - The transaction is committed iff the loop completes. If the
   *    loop throws (e.g., DB connectivity failure), the transaction
   *    is rolled back and the error is propagated to the caller.
   *  - The `QueryRunner` is ALWAYS released in `finally`.
   */
  abstract bulkCreateInTransaction(
    projectId: string,
    inviterId: string,
    entries: readonly BulkInviteRepoEntry[],
  ): Promise<BulkInviteRepoResult>;
}
