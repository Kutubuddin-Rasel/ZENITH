// src/epics/dto/update-epic.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateEpicDto } from './create-epic.dto';
export class UpdateEpicDto extends PartialType(CreateEpicDto) {}
