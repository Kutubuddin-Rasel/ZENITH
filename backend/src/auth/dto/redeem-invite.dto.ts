import { IsString, MinLength } from 'class-validator';

export class RedeemInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name?: string;
}
