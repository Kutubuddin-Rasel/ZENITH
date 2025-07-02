// src/epics/entities/story.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Epic } from './epic.entity';

export enum StoryStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
}

@Entity({ name: 'stories' })
export class Story {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() epicId: string;
  @ManyToOne(() => Epic, (e) => e.stories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'epicId' })
  epic: Epic;

  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ type: 'enum', enum: StoryStatus, default: StoryStatus.TODO })
  status: StoryStatus;
  @Column({ type: 'int', default: 0 }) storyPoints: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
