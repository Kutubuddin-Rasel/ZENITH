// src/releases/dto/assign-issue.dto.ts
import { IsUUID } from 'class-validator';

export class AssignIssueDto {
  @IsUUID() issueId: string;
}
