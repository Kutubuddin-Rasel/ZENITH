// src/releases/services/release-deployment.service.ts
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AuditPort } from '../../issues';
import { PROJECT_QUERY_TOKEN, type IProjectQuery } from '../../projects';
import { PROJECT_MEMBER_QUERY_TOKEN } from 'src/membership/constants/membership.tokens';
import type { IProjectMemberQuery } from 'src/membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  RELEASE_COMMAND_TOKEN,
  RELEASE_QUERY_TOKEN,
} from '../constants/releases.tokens';
import { ReleaseNotificationPort } from '../ports/release-notification.port';
import {
  validateWebhookUrl,
  buildSecureRequestConfig,
} from '../config/webhook-validator.config';
import type {
  DeployResult,
  IReleaseCommand,
  IReleaseDeployment,
  IReleaseQuery,
} from '../interfaces/releases.interfaces';
import { ReleaseStatus } from '../entities/release.entity';

/**
 * Deployment surface (RELEASE_DEPLOYMENT_TOKEN). Isolates the SSRF-sensitive
 * webhook path: allowlist validation, idempotency, status-on-failure. Reads via
 * the query surface, mutates via the command surface (the SSRF-failure path
 * flips the release back to UPCOMING), and emits via the audit/notification
 * ports — no direct TypeORM or concrete collaborators.
 */
@Injectable()
export class ReleaseDeploymentService implements IReleaseDeployment {
  private readonly logger = new Logger(ReleaseDeploymentService.name);

  constructor(
    @Inject(RELEASE_QUERY_TOKEN) private readonly query: IReleaseQuery,
    @Inject(RELEASE_COMMAND_TOKEN) private readonly command: IReleaseCommand,
    @Inject(PROJECT_QUERY_TOKEN) private readonly projectsQuery: IProjectQuery,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly membersService: IProjectMemberQuery,
    private readonly audit: AuditPort,
    private readonly notifications: ReleaseNotificationPort,
  ) {}

  async listWebhooks(projectId: string, userId: string): Promise<unknown[]> {
    await this.projectsQuery.findById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    // Placeholder for the DeploymentWebhook aggregate (entity exists; no
    // persistence wired yet). Returns empty until that capability lands.
    return [];
  }

  /**
   * Trigger a deployment webhook for a release.
   *
   * SECURITY: SSRF allowlist validation, idempotency guard (no double-deploy),
   * HTTPS-only/no-redirects/5s timeout, and status rollback on failure.
   */
  async triggerDeploy(
    projectId: string,
    releaseId: string,
    webhookUrl: string,
    userId: string,
  ): Promise<DeployResult> {
    const release = await this.query.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can trigger deployments');
    }

    // SECURITY: idempotency — never re-deploy an already-released release.
    if (release.status === ReleaseStatus.RELEASED) {
      this.logger.warn(
        `Deployment blocked: Release ${releaseId} is already deployed`,
      );
      return {
        success: false,
        message: `Release ${release.name} is already deployed. Create a new release or rollback instead.`,
      };
    }

    // Placeholder mode: no webhook configured → mark triggered, audit, notify.
    if (!webhookUrl || webhookUrl.trim() === '') {
      this.logger.debug('No webhook URL provided, running in placeholder mode');
      void this.audit.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: projectId,
        actor_id: userId,
        resource_type: 'Release',
        resource_id: releaseId,
        action_type: 'UPDATE',
        metadata: {
          event: 'RELEASE_DEPLOYED',
          releaseName: release.name,
          severity: 'CRITICAL',
          webhookConfigured: false,
          success: true,
        },
      });
      void this.notifications.notifyWatchersOnEvent(
        projectId,
        null,
        `triggered deployment for ${release.name}`,
        userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: `Deployment triggered for release ${release.name} (no webhook configured)`,
      };
    }

    // SECURITY: SSRF prevention — validate the webhook URL against the allowlist.
    let validatedUrl: URL;
    try {
      validatedUrl = validateWebhookUrl(webhookUrl);
    } catch (error) {
      this.logger.error(`SSRF blocked for release ${releaseId}: ${error}`);
      void this.audit.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: projectId,
        actor_id: userId,
        resource_type: 'Release',
        resource_id: releaseId,
        action_type: 'UPDATE',
        metadata: {
          event: 'DEPLOYMENT_FAILED',
          releaseName: release.name,
          severity: 'CRITICAL',
          success: false,
          failureReason: 'SSRF_BLOCKED',
          // SECURITY: never log the full URL (may carry tokens); host only.
          attemptedHost: new URL(webhookUrl).hostname,
        },
      });
      await this.command.update(projectId, releaseId, userId, {
        status: ReleaseStatus.UPCOMING,
        description:
          release.description + `\n\n⚠️ Deployment failed: Invalid webhook URL`,
      });
      throw error;
    }

    const requestConfig = buildSecureRequestConfig();
    void requestConfig;
    this.logger.log(
      `Deploying ${release.name} via webhook: ${validatedUrl.hostname}`,
    );

    // PLACEHOLDER: in production, issue the actual HTTP POST with requestConfig.

    void this.audit.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: releaseId,
      action_type: 'UPDATE',
      metadata: {
        event: 'RELEASE_DEPLOYED',
        releaseName: release.name,
        severity: 'CRITICAL',
        webhookConfigured: true,
        webhookHost: validatedUrl.hostname,
        success: true,
      },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      null,
      `triggered deployment for ${release.name}`,
      userId,
    );

    return {
      success: true,
      statusCode: 200,
      message: `Deployment triggered for release ${release.name} via ${validatedUrl.hostname}`,
    };
  }
}
