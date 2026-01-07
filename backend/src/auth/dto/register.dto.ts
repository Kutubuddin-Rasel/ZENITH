import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

/**
 * RegisterDto - User registration payload with password requirements
 *
 * Password Policy (NIST 800-63B aligned):
 * - Minimum 12 characters (entropy-based security)
 * - Maximum 128 characters (prevent DoS via hash computation)
 * - Must contain at least one lowercase, uppercase, number, and special character
 *
 * Alternative: Allow 12+ chars without complexity for passphrase support
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(12, {
    message: 'Password must be at least 12 characters long',
  })
  @MaxLength(128, {
    message: 'Password must be less than 128 characters',
  })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
    {
      message:
        'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
  password: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be less than 100 characters' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Workspace name must be less than 100 characters' })
  workspaceName?: string; // If provided, creates organization
}
