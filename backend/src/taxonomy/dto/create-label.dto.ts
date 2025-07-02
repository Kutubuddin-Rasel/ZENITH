// src/taxonomy/dto/create-label.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
export class CreateLabelDto {
  @IsString() @IsNotEmpty() name: string;
}
