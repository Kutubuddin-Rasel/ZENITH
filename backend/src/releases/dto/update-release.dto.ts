// src/releases/dto/update-release.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateReleaseDto } from './create-release.dto';
import { IsOptional } from 'class-validator';

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
  // allow toggling isReleased
  @IsOptional() isReleased?: boolean;
}
