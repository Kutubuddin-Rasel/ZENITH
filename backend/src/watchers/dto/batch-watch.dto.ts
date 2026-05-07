// src/watchers/dto/batch-watch.dto.ts
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { WatchPreference } from '../enums/watch-preference.enum';

/**
 * Strictly-typed payload for batch toggling issue watchers within a project.
 * - DoS guard: ArrayMaxSize caps the per-request workload.
 */
export class BatchWatchIssuesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100, { message: 'Cannot batch more than 100 issues per call' })
  @IsUUID('4', { each: true })
  issueIds!: string[];

  @IsOptional()
  @IsEnum(WatchPreference)
  preference?: WatchPreference;
}

export interface BatchWatchFailure {
  issueId: string;
  reason: string;
}

export interface BatchWatchResult {
  success: number;
  failed: number;
  failures: BatchWatchFailure[];
}
