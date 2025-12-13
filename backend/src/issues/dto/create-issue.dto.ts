import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import {
  IssueStatus,
  IssuePriority,
  IssueType,
} from '../entities/issue.entity';

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
  @ValidateIf(
    (o: CreateIssueDto) => o.assigneeId !== null && o.assigneeId !== undefined,
  )
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  storyPoints?: number;

  @IsOptional()
  projectId?: string;

  @IsOptional()
  @IsOptional()
  estimatedHours?: number;

  @IsOptional()
  metadata?: Record<string, any>;
}
