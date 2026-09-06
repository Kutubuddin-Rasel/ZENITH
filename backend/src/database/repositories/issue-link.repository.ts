import { IssueLink } from '../../issues/entities/issue-link.entity';
import {
  IIssueLinkReader,
  IIssueLinkWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for IssueLink persistence (Tier-1, Step 2).
 *
 * Promotes the issue-link sub-aggregate out of the issues module's
 * `@InjectRepository(IssueLink)` reach into a shared abstract repository,
 * bound inside `DatabaseModule` via
 *   `{ provide: IssueLinkRepository, useClass: TypeOrmIssueLinkRepository }`.
 *
 * Beyond the inherited `BaseRepository` CRUD surface it adds a single
 * domain finder, `findForIssue`, that encapsulates the bidirectional
 * (source OR target) lookup the `getLinks` read path needs — keeping the
 * `[{ sourceIssueId }, { targetIssueId }]` query shape out of the service.
 */
export abstract class IssueLinkRepository
  extends BaseRepository<IssueLink>
  implements IIssueLinkReader, IIssueLinkWriter
{
  /**
   * Every link anchored on an issue in EITHER direction (source or
   * target), with both `sourceIssue` and `targetIssue` relations
   * eager-loaded for the link-list UI.
   */
  abstract findForIssue(issueId: string): Promise<IssueLink[]>;
}
