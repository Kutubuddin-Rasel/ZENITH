import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
