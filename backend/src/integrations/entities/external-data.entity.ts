import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Integration } from './integration.entity';

export interface MappedData {
  title: string;
  content: string;
  author: string;
  source: string;
  url: string;
  metadata: Record<string, unknown>;
}

@Entity('external_data')
@Index(['integrationId', 'externalId', 'externalType'], { unique: true })
export class ExternalData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  externalId: string;

  @Column()
  externalType: string;

  @Column()
  integrationId: string;

  @ManyToOne(() => Integration, (integration) => integration.externalData)
  integration: Integration;

  @Column('jsonb')
  rawData: Record<string, unknown>;

  @Column('jsonb', { nullable: true })
  mappedData: MappedData;

  @Column({ type: 'text', nullable: true })
  searchContent: string;

  @Column({ nullable: true })
  lastSyncAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
