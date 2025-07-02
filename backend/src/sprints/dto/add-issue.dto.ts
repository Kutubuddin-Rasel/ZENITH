// src/sprints/dto/add-issue.dto.ts
import { IsUUID, IsOptional, IsInt } from 'class-validator';

export class AddIssueToSprintDto {
  @IsUUID() issueId: string;
  @IsOptional() @IsInt() sprintOrder?: number;
}
