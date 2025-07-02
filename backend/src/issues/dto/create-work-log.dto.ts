import { IsInt, Min, IsOptional, IsString } from 'class-validator';

export class CreateWorkLogDto {
  @IsInt()
  @Min(1)
  minutesSpent: number;

  @IsOptional()
  @IsString()
  note?: string;
} 