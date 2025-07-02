// src/boards/dto/create-board.dto.ts
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { BoardType } from '../entities/board.entity';

export class CreateBoardDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEnum(BoardType) @IsOptional() type?: BoardType;
}
