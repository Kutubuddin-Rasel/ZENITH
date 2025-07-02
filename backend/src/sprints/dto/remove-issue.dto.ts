// src/sprints/dto/remove-issue.dto.ts
import { IsUUID } from 'class-validator';

export class RemoveIssueFromSprintDto {
  @IsUUID() issueId: string;
}
