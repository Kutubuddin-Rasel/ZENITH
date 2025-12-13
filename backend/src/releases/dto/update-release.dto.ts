// src/releases/dto/update-release.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateReleaseDto } from './create-release.dto';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ReleaseStatus } from '../entities/release.entity';

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
  @IsOptional() @IsEnum(ReleaseStatus) status?: ReleaseStatus;
  @IsOptional() @IsBoolean() isReleased?: boolean; // Deprecated
}
