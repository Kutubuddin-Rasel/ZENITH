// src/boards/entities/board-column.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Board } from './board.entity';

@Entity({ name: 'board_columns' })
@Index('IDX_board_column_board_id', ['boardId'])
@Index('IDX_board_column_position', ['columnOrder'])
@Unique('UQ_board_column_board_name', ['boardId', 'name']) // Column names must be unique per board
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  boardId: string;

  @ManyToOne(() => Board, (board) => board.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boardId' })
  board: Board;

  // Linear-style: column name IS the status
  // When issue.status === column.name, the issue appears in this column
  @Column()
  name: string;

  // New: Link to Workflow Status
  @Column({ type: 'uuid', nullable: true })
  statusId: string;

  @ManyToOne('WorkflowStatus', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'statusId' })
  workflowStatus?: any;

  @Column({ type: 'int', default: 0 })
  columnOrder: number; // left-to-right order
}
