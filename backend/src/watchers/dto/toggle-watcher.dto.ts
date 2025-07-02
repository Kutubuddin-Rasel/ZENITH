// src/watchers/dto/toggle-watcher.dto.ts
import { IsUUID } from 'class-validator';

export class ToggleWatcherDto {
  @IsUUID() userId: string; // watcher’s userId (can default to req.user.userId)
}
