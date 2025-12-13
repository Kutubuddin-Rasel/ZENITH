import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';
import { CustomFieldType } from '../entities/custom-field-definition.entity';

export class CreateCustomFieldDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CustomFieldType)
  @IsNotEmpty()
  type: CustomFieldType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}
