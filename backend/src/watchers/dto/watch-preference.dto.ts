// src/watchers/dto/watch-preference.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { WatchPreference } from '../enums/watch-preference.enum';

/**
 * Optional body for toggle/batch endpoints. When the toggle results in a
 * subscription being created, this preference is persisted on the new row.
 * Omitting the field preserves legacy behavior (ALL).
 */
export class WatchPreferenceDto {
  @IsOptional()
  @IsEnum(WatchPreference)
  preference?: WatchPreference;
}
