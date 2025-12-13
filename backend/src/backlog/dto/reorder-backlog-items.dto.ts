import { IsArray, IsString } from 'class-validator';

export class ReorderBacklogItemsDto {
  @IsArray()
  @IsString({ each: true })
  issueIds: string[];
}
