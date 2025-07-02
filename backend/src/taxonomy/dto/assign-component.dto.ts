// src/taxonomy/dto/assign-component.dto.ts
import { IsUUID } from 'class-validator';
export class AssignComponentDto {
  @IsUUID() componentId: string;
}
