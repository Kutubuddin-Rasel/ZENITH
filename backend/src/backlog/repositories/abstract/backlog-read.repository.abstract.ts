import type { IssueView } from '../../../issues';

/**
 * BacklogReadRepository — DIP token for the backlog's read projection.
 *
 * The backlog owns no rows: its queue is the `Issue` aggregate
 * left-joined against sprint membership. This abstract class is the
 * single read seam for that derived view — a deliberate **read model**
 * (denormalised across Issue + `sprint_issues`) and the prep-for-
 * ClickHouse isolation boundary. Swapping PostgreSQL for an analytics
 * store later is a one-file change behind this token.
 *
 * Consumers depend on the abstract class as the injection token
 * (the established repository convention — no separate symbol):
 *   constructor(private readonly backlog: BacklogReadRepository) {}
 *
 * Concrete implementation registered in `BacklogModule` via
 * `{ provide: BacklogReadRepository, useClass: TypeOrmBacklogReadRepository }`.
 *
 * Returns `IssueView` (the issues barrel projection), never the `Issue`
 * entity — the persistence type must not leak across the seam.
 */
export abstract class BacklogReadRepository {
  /**
   * One page of the backlog: issues in the project that are NOT in any
   * sprint and not archived, ordered deterministically
   * (`backlogOrder, createdAt, id`). Returns the page rows and the total
   * matching count in one round-trip.
   */
  abstract findBacklogPage(
    projectId: string,
    skip: number,
    limit: number,
  ): Promise<[IssueView[], number]>;
}
