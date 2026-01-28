import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsUUID,
} from 'class-validator';
import { SanitizeHtml } from '../../common/decorators/safe-transform.decorators';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Z_]+$/, {
    message: 'Key must be uppercase letters and underscores only',
  })
  key: string;

  @SanitizeHtml()
  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'Project Lead ID must be a valid UUID' })
  @IsOptional()
  projectLeadId?: string; // ID of the user who will be Project Lead (optional, defaults to creator)

  // NEW: Optional template ID for pre-configured project setup
  @IsUUID('4', { message: 'Template ID must be a valid UUID' })
  @IsOptional()
  templateId?: string;
}
