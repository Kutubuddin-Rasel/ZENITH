import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  ValidateIf,
  IsInt,
  Min,
} from 'class-validator';
import { IssueStatus, IssuePriority, IssueType } from '../entities/issue.entity';

export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(IssueType)
  type: IssueType;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;

  @IsOptional()
  @ValidateIf((o) => o.assigneeId !== null && o.assigneeId !== undefined)
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  storyPoints?: number;
}
