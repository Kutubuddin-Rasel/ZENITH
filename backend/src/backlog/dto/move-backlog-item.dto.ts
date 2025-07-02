// src/backlog/dto/move-backlog-item.dto.ts
import { IsUUID, IsInt, Min } from 'class-validator';

export class MoveBacklogItemDto {
  @IsUUID() issueId: string;
  @IsInt() @Min(0) newPosition: number;
}
