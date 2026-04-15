import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';

const ALLOWED_ROLES = ['Developer', 'QA', 'Designer', 'ProjectLead', 'Viewer'];

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ROLES, {
    message: `defaultRole must be one of: ${ALLOWED_ROLES.join(', ')}`,
  })
  defaultRole?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ROLES, {
    message: `defaultRole must be one of: ${ALLOWED_ROLES.join(', ')}`,
  })
  defaultRole?: string; // e.g. 'Developer', 'QA', etc.
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(12, {
    message: 'New password must be at least 12 characters long',
  })
  @MaxLength(128, {
    message: 'New password must be less than 128 characters',
  })
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
