// src/taxonomy/dto/update-component.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateComponentDto } from './create-component.dto';
export class UpdateComponentDto extends PartialType(CreateComponentDto) {}
