import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEmail,
} from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsString()
  inviteeId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  inviterId?: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;
}
