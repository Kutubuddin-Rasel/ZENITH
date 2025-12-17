import { PartialType } from '@nestjs/mapped-types';
import { CreateIssueDto } from './create-issue.dto';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  ValidateIf,
  IsInt,
  Min,
} from 'class-validator';
import { IssuePriority, IssueType } from '../entities/issue.entity';

export class UpdateIssueDto extends PartialType(CreateIssueDto) {
  @IsOptional()
  @ValidateIf(
    (o: UpdateIssueDto) => o.assigneeId !== null && o.assigneeId !== undefined,
  )
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsEnum(IssueType)
  type?: IssueType;

  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;

  // Optimistic locking: client sends the version they have,
  // server rejects if it doesn't match (someone else edited)
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
