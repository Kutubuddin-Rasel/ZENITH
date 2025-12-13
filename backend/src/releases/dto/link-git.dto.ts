// src/releases/dto/link-git.dto.ts
import { IsString, IsOptional, IsEnum, IsUrl } from 'class-validator';
import { GitProvider } from '../entities/release.entity';

export class LinkGitDto {
  @IsOptional() @IsString() gitTagName?: string;
  @IsOptional() @IsString() gitBranch?: string;
  @IsOptional() @IsString() commitSha?: string;
  @IsOptional() @IsEnum(GitProvider) gitProvider?: GitProvider;
  @IsOptional() @IsUrl() gitRepoUrl?: string;
}
