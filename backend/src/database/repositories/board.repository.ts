import { FindManyOptions } from 'typeorm';

import { Board } from '../../boards/entities/board.entity';
import {
  IBoardReader,
  IBoardWriter,
} from '../interfaces/repository.interfaces';
import { BaseRepository } from './base.repository';

/**
 * DIP injection token for Board persistence.
 *
 * Concrete impl: `{ provide: BoardRepository, useClass: TypeOrmBoardRepository }`.
 */
export abstract class BoardRepository
  extends BaseRepository<Board>
  implements IBoardReader, IBoardWriter
{
  /** All boards configured for a single project. */
  abstract findByProject(
    projectId: string,
    options?: FindManyOptions<Board>,
  ): Promise<Board[]>;

  /**
   * Canonical board-read with `columns` + `project` eagerly loaded.
   * See `IBoardReader.findScopedWithColumnsAndProject` for the full contract.
   */
  abstract findScopedWithColumnsAndProject(
    projectId: string,
    boardId: string,
  ): Promise<Board | null>;
}
