// src/taxonomy/dto/unassign-component.dto.ts
import { IsUUID } from 'class-validator';
export class UnassignComponentDto {
  @IsUUID() componentId: string;
}
