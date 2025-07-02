// src/releases/dto/create-release.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateReleaseDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsDateString() releaseDate?: string;
}
