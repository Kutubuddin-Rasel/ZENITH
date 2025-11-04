import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class Generate2FADto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class Verify2FADto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Token must be a 6-digit number' })
  token: string;
}

export class Disable2FADto {
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class VerifyLogin2FADto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 8)
  @Matches(/^[A-Z0-9]{6,8}$/, {
    message: 'Token must be 6-8 alphanumeric characters',
  })
  token: string;
}
