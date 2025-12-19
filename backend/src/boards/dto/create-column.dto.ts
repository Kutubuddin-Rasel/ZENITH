// src/boards/dto/create-column.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateColumnDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() status: string;
  @IsInt() @Min(0) @IsOptional() columnOrder?: number;
  @IsUUID() @IsOptional() statusId?: string; // FIX: Allow linking column to WorkflowStatus
}
