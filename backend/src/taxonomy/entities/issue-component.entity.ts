// src/taxonomy/entities/issue-component.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Component } from './component.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity({ name: 'issue_components' })
export class IssueComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  componentId: string;
  @ManyToOne(() => Component, (cmp) => cmp.issueLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'componentId' })
  component: Component;

  @Column()
  issueId: string;
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;
}
