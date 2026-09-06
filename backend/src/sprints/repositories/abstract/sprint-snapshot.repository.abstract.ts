/**
 * Sprints Module — Abstract Snapshot Repository (DIP Boundary, Step 2)
 *
 * The ONLY allowed persistence contract for the `SprintSnapshot`
 * aggregate (the daily burndown/burnup time-series). Concrete
 * implementations (`PostgresSprintSnapshotRepository`) own
 * `@InjectRepository(SprintSnapshot)` exclusively, including the
 * velocity "latest-per-sprint" subquery — no service may build that
 * `QueryBuilder` itself.
 *
 * Isolating the snapshot read surface behind its own repository is the
 * first move of Directive B ("Prep for ClickHouse"): Step 3 binds the
 * analytics service to `SPRINT_METRICS_TOKEN`, and a Level-5 Data/ML
 * phase can later swap THIS repository's implementation to a ClickHouse
 * reader without touching any sprint business logic.
 *
 * Abstract-class-as-DI-token: the class itself IS the token (no
 * `SPRINT_SNAPSHOT_REPOSITORY_TOKEN` symbol). Writes accept an optional
 * `manager?: EntityManager` for EntityManager-Passthrough symmetry with
 * `AbstractSprintRepository`.
 */

import type { EntityManager } from 'typeorm';
import type { SprintSnapshot } from '../../entities/sprint-snapshot.entity';

export abstract class AbstractSprintSnapshotRepository {
  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * Resolve the snapshot for a `(sprintId, date)` pair — the
   * idempotency lookup that lets `captureSnapshot` upsert today's row.
   * Returns `null` when none exists yet.
   */
  abstract findBySprintAndDate(
    sprintId: string,
    date: string,
  ): Promise<SprintSnapshot | null>;

  /**
   * Every snapshot for a sprint, ordered by `date ASC`. Drives the
   * burndown/burnup series and `getSprintSnapshots`.
   */
  abstract findBySprintOrdered(sprintId: string): Promise<SprintSnapshot[]>;

  /**
   * The single most-recent snapshot for EACH sprint id (the
   * `MAX(date)` subquery). Used by the velocity series to read each
   * completed sprint's final burn without an N+1 loop. Returns `[]`
   * for an empty id list (so callers never hit an empty `IN (...)`).
   */
  abstract findLatestPerSprint(sprintIds: string[]): Promise<SprintSnapshot[]>;

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Build a non-persisted `SprintSnapshot` from a partial payload
   * (mirrors `Repository<SprintSnapshot>.create`). No DB access.
   */
  abstract createEntity(data: Partial<SprintSnapshot>): SprintSnapshot;

  /**
   * Insert-or-update a snapshot by primary key. Accepts an optional
   * `manager` for transactional callers (parity with the sprint
   * repo); the daily cron calls it bare.
   */
  abstract save(
    snapshot: SprintSnapshot,
    manager?: EntityManager,
  ): Promise<SprintSnapshot>;
}
