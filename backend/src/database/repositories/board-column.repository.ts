import { BoardColumn } from '../../boards/entities/board-column.entity';
import {
  IBoardColumnReader,
  IBoardColumnWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for BoardColumn persistence (Step 2 promotion).
 *
 * Replaces the legacy `@InjectRepository(BoardColumn)` injection in
 * `BoardsService` — a CRITICAL DIP violation per `SOLID_STANDARDS.md`. Now
 * `BoardsService` (and the Step 3 `BoardColumnCommandService` /
 * `BoardOrderingService`) depend ONLY on this abstract class.
 *
 * Concrete impl: `{ provide: BoardColumnRepository, useClass: TypeOrmBoardColumnRepository }`.
 *
 * The two non-Base methods on this surface absorb behavior previously inlined
 * in `boards.service.ts`:
 *  - `findOneByBoard`: closes the cross-board lookup gap at lines 480, 518.
 *  - `bulkReorder`:    extracts the parameterized VALUES UPDATE at line 587,
 *                      keeping raw SQL out of the service layer.
 *
 * `findByBoard` is offered for completeness — at present `findOne` with
 * `relations: ['columns']` returns columns via the parent `Board` aggregate;
 * Step 3 may use the direct finder when the read-path moves to a dedicated
 * query service.
 */
export abstract class BoardColumnRepository
  extends BaseRepository<BoardColumn>
  implements IBoardColumnReader, IBoardColumnWriter
{
  /** All columns belonging to a single board, ordered left-to-right. */
  abstract findByBoard(boardId: string): Promise<BoardColumn[]>;

  /**
   * Lookup a single column scoped by `(boardId, columnId)`.
   * See `IBoardColumnReader.findOneByBoard` for the full contract.
   */
  abstract findOneByBoard(
    boardId: string,
    columnId: string,
  ): Promise<BoardColumn | null>;

  /**
   * Bulk-reorder the columns of a single board.
   * See `IBoardColumnWriter.bulkReorder` for the full contract.
   */
  abstract bulkReorder(
    boardId: string,
    orderedColumnIds: readonly string[],
  ): Promise<void>;
}
