// src/releases/dto/unassign-issue.dto.ts
import { IsUUID } from 'class-validator';

export class UnassignIssueDto {
  @IsUUID() issueId: string;
}
