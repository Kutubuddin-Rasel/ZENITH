import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
} from 'class-validator';
import { IssuePriority } from '../entities/issue.entity';

export class CreateIssueIntentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(IssuePriority)
  @IsOptional()
  priority?: IssuePriority;

  @IsString()
  @IsOptional()
  browser?: string;

  @IsString()
  @IsOptional()
  version?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  stepsToReproduce?: string[];

  @IsString()
  @IsOptional()
  expectedBehavior?: string;

  @IsString()
  @IsOptional()
  actualBehavior?: string;
}
