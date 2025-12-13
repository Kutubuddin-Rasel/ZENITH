// src/releases/dto/create-webhook.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUrl,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { WebhookProvider } from '../entities/deployment-webhook.entity';

export class CreateWebhookDto {
  @IsString() @IsNotEmpty() name: string;
  @IsUrl() @IsNotEmpty() webhookUrl: string;
  @IsOptional() @IsEnum(WebhookProvider) provider?: WebhookProvider;
  @IsOptional() @IsObject() headers?: Record<string, string>;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWebhookDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUrl() webhookUrl?: string;
  @IsOptional() @IsEnum(WebhookProvider) provider?: WebhookProvider;
  @IsOptional() @IsObject() headers?: Record<string, string>;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
