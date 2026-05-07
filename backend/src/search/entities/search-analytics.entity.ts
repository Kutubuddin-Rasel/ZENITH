import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Records every search the platform serves for product analytics
 * (popular queries, zero-result queries, per-tenant trends).
 *
 * Writes are fire-and-forget from SearchService; index supports
 * the typical "queries in org X over time window Y" lookup.
 */
@Entity({ name: 'search_analytics' })
@Index('IDX_search_analytics_org_created', ['orgId', 'createdAt'])
@Index('IDX_search_analytics_user_created', ['userId', 'createdAt'])
export class SearchAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 512 })
  query: string;

  @Column({ type: 'integer' })
  resultCount: number;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
