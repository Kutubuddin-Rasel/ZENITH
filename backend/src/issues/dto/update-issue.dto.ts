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
import {
  IssueStatus,
  IssuePriority,
  IssueType,
} from '../entities/issue.entity';

export class UpdateIssueDto extends PartialType(CreateIssueDto) {
  @IsOptional()
  @ValidateIf((o: any) => o.assigneeId !== null && o.assigneeId !== undefined)
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsEnum(IssueType)
  type?: IssueType;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;

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
}
