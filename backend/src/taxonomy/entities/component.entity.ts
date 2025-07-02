// src/taxonomy/entities/component.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { IssueComponent } from './issue-component.entity';

@Entity({ name: 'components' })
export class Component {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ unique: true })
  name: string; // e.g. "API", “UI”

  @OneToMany(() => IssueComponent, (ic) => ic.component, { cascade: true })
  issueLinks: IssueComponent[];
}
