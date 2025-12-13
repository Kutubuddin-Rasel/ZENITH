import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('projects/:projectId/webhooks')
  create(
    @Param('projectId') projectId: string,
    @Body() createWebhookDto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(projectId, createWebhookDto);
  }

  @Get('projects/:projectId/webhooks')
  findAll(@Param('projectId') projectId: string) {
    return this.webhooksService.findAll(projectId);
  }

  @Get('webhooks/:id')
  findOne(@Param('id') id: string) {
    return this.webhooksService.findOne(id);
  }

  @Patch('webhooks/:id')
  update(
    @Param('id') id: string,
    @Body() updates: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    return this.webhooksService.update(id, updates);
  }

  @Delete('webhooks/:id')
  async remove(@Param('id') id: string) {
    await this.webhooksService.remove(id);
    return { message: 'Webhook deleted successfully' };
  }

  @Post('webhooks/:id/test')
  async test(@Param('id') id: string) {
    await this.webhooksService.test(id);
    return { message: 'Test webhook sent' };
  }

  @Get('webhooks/:id/logs')
  getLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.webhooksService.getLogs(id, limitNum);
  }
}
