import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SaveOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { BoardColumn } from '../../../boards/entities/board-column.entity';
import { BoardColumnRepository } from '../board-column.repository';

/**
 * TypeORM-backed BoardColumn repository (Step 2).
 *
 * INTERNAL ONLY. Not exported from `DatabaseModule` — consumers depend on the
 * abstract `BoardColumnRepository` token.
 *
 * `@InjectRepository` is allowed in THIS layer only (per SOLID_STANDARDS DIP
 * exemption for `database/repositories/typeorm/*`). Every other module
 * remains DIP-clean.
 */
@Injectable()
export class TypeOrmBoardColumnRepository extends BoardColumnRepository {
  constructor(
    @InjectRepository(BoardColumn)
    private readonly repo: Repository<BoardColumn>,
  ) {
    super();
  }

  findById(id: string): Promise<BoardColumn | null> {
    return this.repo.findOne({
      where: { id } as FindOptionsWhere<BoardColumn>,
    });
  }

  findOne(options: FindOneOptions<BoardColumn>): Promise<BoardColumn | null> {
    return this.repo.findOne(options);
  }

  findMany(options?: FindManyOptions<BoardColumn>): Promise<BoardColumn[]> {
    return this.repo.find(options);
  }

  findAndCount(
    options?: FindManyOptions<BoardColumn>,
  ): Promise<[BoardColumn[], number]> {
    return this.repo.findAndCount(options);
  }

  findByBoard(boardId: string): Promise<BoardColumn[]> {
    return this.repo.find({
      where: { boardId },
      order: { columnOrder: 'ASC' },
    });
  }

  findOneByBoard(
    boardId: string,
    columnId: string,
  ): Promise<BoardColumn | null> {
    return this.repo.findOne({ where: { id: columnId, boardId } });
  }

  count(where?: FindOptionsWhere<BoardColumn>): Promise<number> {
    return this.repo.count({ where });
  }

  exists(where: FindOptionsWhere<BoardColumn>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  create(data: DeepPartial<BoardColumn>): BoardColumn {
    return this.repo.create(data);
  }

  save(
    data: DeepPartial<BoardColumn>,
    options?: SaveOptions,
  ): Promise<BoardColumn> {
    return this.repo.save(data, options);
  }

  saveMany(
    data: DeepPartial<BoardColumn>[],
    options?: SaveOptions,
  ): Promise<BoardColumn[]> {
    return this.repo.save(data, options);
  }

  async update(
    id: string,
    patch: QueryDeepPartialEntity<BoardColumn>,
  ): Promise<void> {
    await this.repo.update(id, patch);
  }

  remove(entity: BoardColumn): Promise<BoardColumn> {
    return this.repo.remove(entity);
  }

  /**
   * `BoardColumn` does not declare `@DeleteDateColumn` — soft-delete is not
   * supported by the underlying schema. We satisfy LSP by throwing a hard
   * runtime error rather than silently no-op'ing; any caller reaching this
   * branch has a bug (the abstract `BaseRepository.softRemove` should never
   * be invoked on a non-soft-deletable aggregate).
   */
  softRemove(_entity: BoardColumn): Promise<BoardColumn> {
    return Promise.reject(
      new Error(
        'BoardColumn does not support softRemove — no @DeleteDateColumn on the entity.',
      ),
    );
  }

  restore(_id: string): Promise<void> {
    return Promise.reject(
      new Error(
        'BoardColumn does not support restore — no @DeleteDateColumn on the entity.',
      ),
    );
  }

  /**
   * Bulk-reorder columns within a board using a parameterized VALUES clause.
   *
   * Extracted verbatim from the legacy `boards.service.ts:572-594` so Step 2
   * preserves runtime behavior exactly (per the plan's "zero behavior change
   * beyond DIP+transaction" gate).
   *
   * @RAW_QUERY_AUDIT: Fully parameterized — no string interpolation.
   * Tenant isolation: `boardId` in WHERE ensures only columns belonging to
   * the supplied board are updated.
   *
   * @KNOWN_ISSUE: The SET clause targets a column literally named `"order"`,
   * but the entity property `columnOrder` has no `@Column({ name: 'order' })`
   * override, so TypeORM creates the underlying column as `"columnOrder"`.
   * This mismatch is PRE-EXISTING (introduced before Step 2) and intentionally
   * preserved here — a separate fix-forward PR should change `SET "order"` to
   * `SET "columnOrder"` (and the corresponding `v(id, "order")` alias). Step 2
   * is repository inversion only; behavior fixes are out of scope.
   */
  async bulkReorder(
    boardId: string,
    orderedColumnIds: readonly string[],
  ): Promise<void> {
    if (orderedColumnIds.length === 0) return;

    if (orderedColumnIds.length > 5000) {
      throw new Error(
        'TypeOrmBoardColumnRepository.bulkReorder: max 5000 columns per call.',
      );
    }

    const params: (string | number)[] = [];
    const placeholders: string[] = [];

    orderedColumnIds.forEach((id, idx) => {
      params.push(id, idx);
      const n = params.length;
      placeholders.push(`($${n - 1}::uuid, $${n}::int)`);
    });

    const boardIdParamIndex = params.length + 1;
    params.push(boardId);

    await this.repo.query(
      `UPDATE board_columns AS c
       SET "order" = v."order"
       FROM (VALUES ${placeholders.join(', ')}) AS v(id, "order")
       WHERE c.id = v.id
       AND c."boardId" = $${boardIdParamIndex}`,
      params,
    );
  }
}
