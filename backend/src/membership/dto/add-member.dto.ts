import { IsString } from 'class-validator';

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsString()
  roleName: string;
}
