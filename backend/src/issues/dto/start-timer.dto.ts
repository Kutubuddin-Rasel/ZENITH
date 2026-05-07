import { IsString, IsUUID } from 'class-validator';

export class StartTimerDto {
  @IsString()
  @IsUUID()
  projectId: string;

  @IsString()
  @IsUUID()
  issueId: string;
}
