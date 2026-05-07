// src/revisions/dto/comparison.dto.ts
import { EntityType } from '../entities/revision.entity';
import { FieldDiff } from '../services/diff.service';

/**
 * Lightweight metadata for one of the two revisions being compared.
 * Excludes the raw snapshot to keep payloads compact; full diff lives in `changes`.
 */
export interface ComparisonRevisionMeta {
  id: string;
  entityType: EntityType;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedBy: string;
  createdAt: Date;
}

/**
 * Strict response shape for GET /revisions/:entityType/:entityId/compare/:revisionA/:revisionB
 *
 * - `from` / `to` describe the chronological order (older → newer).
 * - `changes` is the field-level diff produced by DiffService.
 * - `summary` is the human-readable headline string.
 */
export interface ComparisonResponseDto {
  from: ComparisonRevisionMeta;
  to: ComparisonRevisionMeta;
  entityType: EntityType;
  entityId: string;
  changes: FieldDiff[];
  summary: string;
}
