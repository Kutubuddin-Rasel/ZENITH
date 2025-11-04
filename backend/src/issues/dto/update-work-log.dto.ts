import { IsInt, Min, IsOptional, IsString } from 'class-validator';

export class UpdateWorkLogDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  minutesSpent?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
