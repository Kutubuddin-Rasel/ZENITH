// src/taxonomy/dto/create-component.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
export class CreateComponentDto {
  @IsString() @IsNotEmpty() name: string;
}
