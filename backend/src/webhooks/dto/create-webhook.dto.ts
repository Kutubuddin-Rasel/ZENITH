import { IsNotEmpty, IsArray, IsUrl, IsEnum } from 'class-validator';
import { WebhookEventType } from '../enums/webhook-event-type.enum';

export class CreateWebhookDto {
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @IsArray()
  @IsEnum(WebhookEventType, {
    each: true,
    message: `Each event must be a valid WebhookEventType`,
  })
  events: WebhookEventType[];
}
