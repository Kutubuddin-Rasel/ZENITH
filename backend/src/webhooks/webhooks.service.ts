import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookLog } from './entities/webhook-log.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { generateHexToken } from '../common/utils/token.util';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { EncryptionService } from '../common/services/encryption.service';
import {
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_DELIVERY_JOB,
  WebhookDeliveryJobData,
} from './webhook-delivery.interfaces';

// ============================================================================
// WEBHOOKS SERVICE
//
// ARCHITECTURE:
//   Producer — enqueues webhook delivery jobs to BullMQ.
//   Consumer — WebhookDeliveryProcessor handles HTTP delivery separately.
//
// SECURITY:
//   Two authorization layers protect webhook operations:
//
//   1. PROJECT-SCOPED routes (create, findAll):
//      → ProjectRoleGuard in the controller validates project membership
//
//   2. ENTITY-SCOPED routes (update, remove, test, findOne, getLogs):
//      → Service resolves webhook.projectId → checks user's role via
//        ProjectMembersService.getUserRole()
// ============================================================================

/** Roles that are allowed to manage (create/update/delete) webhooks */
const WEBHOOK_ADMIN_ROLES: ProjectRole[] = [ProjectRole.PROJECT_LEAD];

/** Roles that are allowed to view webhooks and logs */
const WEBHOOK_VIEW_ROLES: ProjectRole[] = [
  ProjectRole.PROJECT_LEAD,
  ProjectRole.MEMBER,
  ProjectRole.DEVELOPER,
  ProjectRole.QA,
  ProjectRole.DESIGNER,
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Webhook)
    private webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookLog)
    private logRepo: Repository<WebhookLog>,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE)
    private readonly deliveryQueue: Queue<WebhookDeliveryJobData>,
    private readonly projectMembersService: ProjectMembersService,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ==========================================================================
  // AUTHORIZATION HELPER
  // ==========================================================================

  /**
   * Authorizes a user's access to a webhook by resolving its projectId
   * and checking the user's role in that project.
   *
   * @param webhook - The webhook entity (must have projectId)
   * @param userId - The requesting user's ID
   * @param allowedRoles - Roles that are permitted for this operation
   * @throws ForbiddenException if user lacks required project role
   */
  private async authorizeWebhookAccess(
    webhook: Webhook,
    userId: string,
    allowedRoles: ProjectRole[],
  ): Promise<void> {
    const userRole = await this.projectMembersService.getUserRole(
      webhook.projectId,
      userId,
    );

    if (!userRole) {
      throw new ForbiddenException(
        'You are not a member of the project this webhook belongs to',
      );
    }

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${userRole}`,
      );
    }
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new webhook subscription.
   * Authorization: ProjectRoleGuard validates projectId in controller.
   *
   * SECURITY: The HMAC secret is encrypted before persisting to DB.
   * Only the ciphertext (iv:authTag:encrypted) is stored.
   */
  async create(projectId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const plainSecret = generateHexToken(64);
    const encryptedSecret = this.encryptionService.encrypt(plainSecret);

    const webhook = this.webhookRepo.create({
      url: dto.url,
      secret: encryptedSecret,
      events: dto.events,
      projectId,
      isActive: true,
      failureCount: 0,
    });

    return this.webhookRepo.save(webhook);
  }

  /**
   * Get all webhooks for a project.
   * Authorization: ProjectRoleGuard validates projectId in controller.
   */
  async findAll(projectId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single webhook.
   * Authorization: Service-level — resolves webhook.projectId → role check.
   */
  async findOne(id: string, userId?: string): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (userId) {
      await this.authorizeWebhookAccess(webhook, userId, WEBHOOK_VIEW_ROLES);
    }

    return webhook;
  }

  /**
   * Update webhook.
   * Authorization: Service-level — only PROJECT_LEAD can modify.
   */
  async update(
    id: string,
    updates: { url?: string; events?: string[]; isActive?: boolean },
    userId?: string,
  ): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (userId) {
      await this.authorizeWebhookAccess(webhook, userId, WEBHOOK_ADMIN_ROLES);
    }

    Object.assign(webhook, updates);
    return this.webhookRepo.save(webhook);
  }

  /**
   * Delete webhook.
   * Authorization: Service-level — only PROJECT_LEAD can delete.
   */
  async remove(id: string, userId?: string): Promise<void> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (userId) {
      await this.authorizeWebhookAccess(webhook, userId, WEBHOOK_ADMIN_ROLES);
    }

    await this.webhookRepo.remove(webhook);
  }

  // ==========================================================================
  // WEBHOOK TRIGGERING (enqueue to BullMQ)
  // ==========================================================================

  /**
   * Find matching webhooks and enqueue a delivery job for each.
   *
   * This is the PRODUCER side — jobs are persisted in Redis and
   * processed by WebhookDeliveryProcessor (the CONSUMER).
   * Survives server restarts.
   */
  async trigger(
    projectId: string,
    event: string,
    payload: object,
  ): Promise<void> {
    const webhooks = await this.webhookRepo.find({
      where: { projectId, isActive: true },
    });

    const matchingWebhooks = webhooks.filter((wh) => wh.events.includes(event));

    if (matchingWebhooks.length === 0) return;

    const jobs = matchingWebhooks.map((webhook) => ({
      name: WEBHOOK_DELIVERY_JOB,
      data: {
        webhookId: webhook.id,
        event,
        payload,
      } satisfies WebhookDeliveryJobData,
    }));

    await this.deliveryQueue.addBulk(jobs);

    this.logger.debug(
      `Enqueued ${jobs.length} webhook delivery job(s) for event '${event}' in project ${projectId}`,
    );
  }

  // ==========================================================================
  // LOGS & TESTING
  // ==========================================================================

  /**
   * Get webhook delivery logs.
   * Authorization: Service-level — view roles can see logs.
   */
  async getLogs(
    webhookId: string,
    limit = 50,
    userId?: string,
  ): Promise<WebhookLog[]> {
    if (userId) {
      const webhook = await this.webhookRepo.findOne({
        where: { id: webhookId },
      });
      if (!webhook) {
        throw new NotFoundException('Webhook not found');
      }
      await this.authorizeWebhookAccess(webhook, userId, WEBHOOK_VIEW_ROLES);
    }

    return this.logRepo.find({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Test webhook by enqueuing a test delivery job.
   * Authorization: Service-level — only PROJECT_LEAD can test.
   */
  async test(webhookId: string, userId?: string): Promise<void> {
    const webhook = await this.webhookRepo.findOne({
      where: { id: webhookId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (userId) {
      await this.authorizeWebhookAccess(webhook, userId, WEBHOOK_ADMIN_ROLES);
    }

    await this.deliveryQueue.add(WEBHOOK_DELIVERY_JOB, {
      webhookId: webhook.id,
      event: 'webhook.test',
      payload: { message: 'This is a test webhook delivery' },
    });
  }

  // ==========================================================================
  // EVENT LISTENERS (internal system events — no user auth)
  // ==========================================================================

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
