import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Check,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('resource_forecasts')
@Check('"confidenceScore" >= 0 AND "confidenceScore" <= 1')
export class ResourceForecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @Column('date')
  forecastDate: Date;

  @Column('jsonb')
  resourceNeeds: Record<string, unknown>; // Skill requirements and quantities

  @Column('jsonb', { nullable: true })
  predictedAllocations: Record<string, unknown>; // AI predictions

  @Column('decimal', { precision: 3, scale: 2, default: 0.5 })
  confidenceScore: number; // 0-1 confidence in prediction

  @Column('jsonb', { nullable: true })
  assumptions: Record<string, unknown>; // Assumptions used in forecast

  @Column('varchar', { length: 20, nullable: true })
  modelVersion: string;

  @CreateDateColumn()
  generatedAt: Date;

  @Column('timestamp', { nullable: true })
  expiresAt: Date;

  // @Index(['project', 'forecastDate'])
  // @Index(['generatedAt'])
}
