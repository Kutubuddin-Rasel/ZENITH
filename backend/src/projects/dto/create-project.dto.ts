import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Z_]+$/, { message: 'Key must be uppercase letters and underscores only' })
  key: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  projectLeadId?: string; // ID of the user who will be Project Lead (optional, defaults to creator)
}
