import { IsString, IsNotEmpty, IsArray, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsArray()
  @IsString({ each: true })
  events: string[];
}
