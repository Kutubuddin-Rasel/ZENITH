// src/comments/dto/create-comment.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCommentDto {
  @IsString() @IsNotEmpty() content: string;
}
