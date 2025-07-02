// src/sprints/dto/update-sprint.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateSprintDto } from './create-sprint.dto';
import { IsString } from 'class-validator';

export class UpdateSprintDto extends PartialType(CreateSprintDto) {
  @IsString()
  goal?: string;
}
