// src/sprints/dto/create-sprint.dto.ts
import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateSprintDto {
  @IsString() @IsNotEmpty() name: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsString() goal?: string;
}
