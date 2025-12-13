import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SAMLProvider } from '../entities/saml-config.entity';

export class AttributeMappingDto {
  @IsString()
  email: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  groups?: string;
}

export class GroupMappingDto {
  [key: string]: string;
}

export class CreateSAMLConfigDto {
  @IsString()
  name: string;

  @IsEnum(SAMLProvider)
  provider: SAMLProvider;

  @IsUrl()
  entryPoint: string;

  @IsString()
  issuer: string;

  @IsString()
  cert: string;

  @IsString()
  @IsOptional()
  privateCert?: string;

  @IsString()
  @IsOptional()
  privateKey?: string;

  @IsUrl()
  @IsOptional()
  callbackUrl?: string;

  @IsUrl()
  @IsOptional()
  logoutUrl?: string;

  @ValidateNested()
  @Type(() => AttributeMappingDto)
  @IsOptional()
  attributeMapping?: AttributeMappingDto;

  @IsObject()
  @IsOptional()
  groupMapping?: GroupMappingDto;

  @IsUrl()
  @IsOptional()
  metadataUrl?: string;

  @IsString()
  @IsOptional()
  metadata?: string;

  @IsBoolean()
  @IsOptional()
  wantAssertionsSigned?: boolean;

  @IsBoolean()
  @IsOptional()
  wantAuthnResponseSigned?: boolean;

  @IsBoolean()
  @IsOptional()
  forceAuthn?: boolean;

  @IsNumber()
  @IsOptional()
  acceptedClockSkewMs?: number;

  @IsNumber()
  @IsOptional()
  maxAssertionAgeMs?: number;

  @IsString()
  @IsOptional()
  organizationId?: string;
}

export class UpdateSAMLConfigDto extends CreateSAMLConfigDto {
  @IsString()
  @IsOptional()
  id?: string;
}

export class TestSAMLConfigDto {
  @IsString()
  configId: string;
}

export class SAMLMetadataDto {
  @IsString()
  configId: string;
}
