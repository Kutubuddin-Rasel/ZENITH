// src/taxonomy/dto/unassign-label.dto.ts
import { IsUUID } from 'class-validator';
export class UnassignLabelDto {
  @IsUUID() labelId: string;
}
