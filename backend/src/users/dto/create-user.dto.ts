import {
  IsEmail,
  IsString,
  MinLength,
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
  @MinLength(6)
  newPassword: string;

  @IsString()
  confirmNewPassword: string;
}
