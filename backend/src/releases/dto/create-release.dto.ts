// src/releases/dto/create-release.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Matches,
} from 'class-validator';

// Semantic versioning pattern: v1.0.0, 1.0.0, v1.0.0-beta, v1.0.0-rc.1
const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.]+)?$/;

export class CreateReleaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(SEMVER_PATTERN, {
    message:
      'Version name must follow semantic versioning (e.g., v1.0.0, 1.2.3, v2.0.0-beta)',
  })
  name: string;

  @IsOptional() @IsDateString() releaseDate?: string;
  @IsOptional() @IsString() description?: string;
}
