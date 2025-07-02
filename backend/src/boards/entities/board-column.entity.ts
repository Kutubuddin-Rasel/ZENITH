// src/boards/entities/board-column.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Board } from './board.entity';

@Entity({ name: 'board_columns' })
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  boardId: string;

  @ManyToOne(() => Board, (board) => board.columns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boardId' })
  board: Board;

  @Column()
  name: string; // e.g. “To Do”

  @Column()
  status: string; // must match Issue.status enum

  @Column({ type: 'int', default: 0 })
  columnOrder: number; // left-to-right order
}
