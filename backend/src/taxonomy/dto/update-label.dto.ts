// src/taxonomy/dto/update-label.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateLabelDto } from './create-label.dto';
export class UpdateLabelDto extends PartialType(CreateLabelDto) {}
