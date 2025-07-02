// src/epics/dto/create-story.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { StoryStatus } from '../entities/story.entity';

export class CreateStoryDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(StoryStatus) status?: StoryStatus;
  @IsOptional() @IsInt() @Min(0) storyPoints?: number;
}
