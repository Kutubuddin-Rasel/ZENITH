// src/boards/entities/board.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { BoardColumn } from './board-column.entity';
import { BoardType } from '../enums/board-type.enum';

// SOLID Refactor (Step 1): BoardType lives in `boards/enums/board-type.enum.ts`
// so the sealed barrel can export it without exposing this entity.
// Re-exported here to keep every legacy import site
// (`dto/create-board.dto.ts`, `boards.service.ts`, `gateways/board.gateway.ts`,
// any sprints/test fixtures) binary-compatible — no call-site churn in Step 1.
export { BoardType };

@Entity({ name: 'boards' })
@Index('IDX_board_project_id', ['projectId'])
@Index('IDX_board_type', ['type'])
@Index('IDX_board_is_active', ['isActive'])
export class Board {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: BoardType, default: BoardType.KANBAN })
  type: BoardType;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => BoardColumn, (col) => col.board, { cascade: true })
  columns: BoardColumn[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
