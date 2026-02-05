import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookLog } from './entities/webhook-log.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto'; // Keep for HMAC signing
import { generateHexToken } from '../common/utils/token.util';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookLog)
    private logRepo: Repository<WebhookLog>,
    private eventEmitter: EventEmitter2,
  ) { }

  /**
   * Create a new webhook subscription
   */
  async create(projectId: string, dto: CreateWebhookDto): Promise<Webhook> {
    // Generate a random secret for HMAC signing using centralized utility
    const secret = generateHexToken(64);

    const webhook = this.webhookRepo.create({
      url: dto.url,
      secret,
      events: dto.events,
      projectId,
      isActive: true,
      failureCount: 0,
    });

    return this.webhookRepo.save(webhook);
  }

  /**
   * Get all webhooks for a project
   */
  async findAll(projectId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single webhook
   */
  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }

  /**
   * Update webhook
   */
  async update(
    id: string,
    updates: { url?: string; events?: string[]; isActive?: boolean },
  ): Promise<Webhook> {
    const webhook = await this.findOne(id);
    Object.assign(webhook, updates);
    return this.webhookRepo.save(webhook);
  }

  /**
   * Delete webhook
   */
  async remove(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepo.remove(webhook);
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(
    projectId: string,
    event: string,
    payload: object,
  ): Promise<void> {
    // Find all active webhooks for this project that subscribe to this event
    const webhooks = await this.webhookRepo.find({
      where: { projectId, isActive: true },
    });

    const matchingWebhooks = webhooks.filter((wh) => wh.events.includes(event));

    // Deliver to each webhook asynchronously
    const deliveryPromises = matchingWebhooks.map((webhook) =>
      this.deliver(webhook, event, payload),
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Deliver webhook with retries
   */
  private async deliver(
    webhook: Webhook,
    event: string,
    payload: object,
    attempt = 1,
  ): Promise<void> {
    const startTime = Date.now();
    const webhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(5000), // 5-second timeout
      });

      const responseBody = await response.text();
      const deliveryDuration = Date.now() - startTime;

      // Log the delivery
      await this.logRepo.save({
        webhookId: webhook.id,
        event,
        payload: webhookPayload,
        responseStatus: response.status,
        responseBody: responseBody.substring(0, 1000), // Limit size
        deliveryDuration,
        success: response.ok,
      });

      // Update webhook stats
      await this.webhookRepo.update(webhook.id, {
        lastTriggeredAt: new Date(),
        failureCount: response.ok ? 0 : webhook.failureCount + 1,
      });

      // Disable webhook after 10 consecutive failures
      if (!response.ok && webhook.failureCount + 1 >= 10) {
        await this.webhookRepo.update(webhook.id, { isActive: false });
      }

      // Retry on failure (max 3 attempts)
      if (!response.ok && attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        setTimeout(
          () => void this.deliver(webhook, event, payload, attempt + 1),
          delay,
        );
      }
    } catch (error) {
      const deliveryDuration = Date.now() - startTime;

      // Log the failure
      await this.logRepo.save({
        webhookId: webhook.id,
        event,
        payload: webhookPayload,
        responseStatus: 0,
        responseBody: (error as Error).message,
        deliveryDuration,
        success: false,
      });

      // Update failure count
      await this.webhookRepo.update(webhook.id, {
        lastTriggeredAt: new Date(),
        failureCount: webhook.failureCount + 1,
      });

      // Disable after 10 failures
      if (webhook.failureCount + 1 >= 10) {
        await this.webhookRepo.update(webhook.id, { isActive: false });
      }

      // Retry
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        setTimeout(
          () => void this.deliver(webhook, event, payload, attempt + 1),
          delay,
        );
      }
    }
  }

  /**
   * Get webhook delivery logs
   */
  async getLogs(webhookId: string, limit = 50): Promise<WebhookLog[]> {
    return this.logRepo.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Test webhook by sending a test event
   */
  async test(webhookId: string): Promise<void> {
    const webhook = await this.findOne(webhookId);
    await this.deliver(webhook, 'webhook.test', {
      message: 'This is a test webhook delivery',
    });
  }

  /**
   * Listen to application events and trigger webhooks
   */
  @OnEvent('issue.**')
  handleIssueEvent(event: { projectId: string; action: string; data: any }) {

    void this.trigger(event.projectId, `issue.${event.action}`, event.data);
  }

  @OnEvent('sprint.**')
  handleSprintEvent(event: { projectId: string; action: string; data: any }) {

    void this.trigger(event.projectId, `sprint.${event.action}`, event.data);
  }

  @OnEvent('project.**')
  handleProjectEvent(event: { projectId: string; action: string; data: any }) {

    void this.trigger(event.projectId, `project.${event.action}`, event.data);
  }
}
