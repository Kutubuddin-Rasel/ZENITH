// src/taxonomy/dto/assign-label.dto.ts
import { IsUUID } from 'class-validator';
export class AssignLabelDto {
  @IsUUID() labelId: string;
}
