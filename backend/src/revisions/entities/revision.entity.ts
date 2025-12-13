// src/revisions/entities/revision.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type EntityType =
  | 'Project'
  | 'Issue'
  | 'Sprint'
  | 'Board'
  | 'Release'
  | 'Label'
  | 'Component';

@Entity({ name: 'revisions' })
// @Index('idx_revisions_snapshot', ['snapshot'], { using: 'gin' })
export class Revision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  entityType: EntityType;

  @Column()
  @Index()
  entityId: string;

  @Column('jsonb')
  snapshot: any; // full JSON of the entity before change

  @Column()
  action: 'CREATE' | 'UPDATE' | 'DELETE';

  @Column()
  changedBy: string; // userId who triggered it

  @CreateDateColumn()
  createdAt: Date;
}
