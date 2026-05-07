import {
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export class CreateWorkLogDto {
  @IsInt()
  @Min(1)
  minutesSpent: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}
