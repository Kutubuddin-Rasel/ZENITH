/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
// src/releases/services/release-deployment.service.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { ReleaseDeploymentService } from './release-deployment.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { ReleaseStatus } from '../entities/release.entity';
import type {
  IReleaseQuery,
  IReleaseCommand,
} from '../interfaces/releases.interfaces';
import {
  validateWebhookUrl,
  buildSecureRequestConfig,
} from '../config/webhook-validator.config';

// Isolate the SSRF allowlist so we can drive both the valid and blocked paths.
jest.mock('../config/webhook-validator.config', () => ({
  validateWebhookUrl: jest.fn(),
  buildSecureRequestConfig: jest.fn(() => ({})),
}));

describe('ReleaseDeploymentService', () => {
  let query: jest.Mocked<IReleaseQuery>;
  let command: jest.Mocked<IReleaseCommand>;
  let projectsQuery: { findById: jest.Mock };
  let members: { getUserRole: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { notifyWatchersOnEvent: jest.Mock };
  let svc: ReleaseDeploymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    (buildSecureRequestConfig as jest.Mock).mockReturnValue({});
    query = { findOne: jest.fn() } as unknown as jest.Mocked<IReleaseQuery>;
    command = { update: jest.fn() } as unknown as jest.Mocked<IReleaseCommand>;
    projectsQuery = { findById: jest.fn().mockResolvedValue({ id: 'p1' }) };
    members = {
      getUserRole: jest.fn().mockResolvedValue(ProjectRole.PROJECT_LEAD),
    };
    audit = { log: jest.fn() };
    notifications = { notifyWatchersOnEvent: jest.fn() };
    svc = new ReleaseDeploymentService(
      query,
      command,
      projectsQuery as never,
      members as never,
      audit as never,
      notifications as never,
    );
  });

  it('requires ProjectLead to trigger a deploy', async () => {
    query.findOne.mockResolvedValue({
      status: ReleaseStatus.UPCOMING,
    } as never);
    members.getUserRole.mockResolvedValue(ProjectRole.MEMBER);
    await expect(
      svc.triggerDeploy('p1', 'r1', '', 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks re-deploy of an already-released release (idempotency)', async () => {
    query.findOne.mockResolvedValue({
      name: 'v1',
      status: ReleaseStatus.RELEASED,
    } as never);
    const res = await svc.triggerDeploy('p1', 'r1', 'https://ci', 'u1');
    expect(res.success).toBe(false);
    expect(res.message).toContain('already deployed');
    expect(validateWebhookUrl).not.toHaveBeenCalled();
  });

  it('runs placeholder mode when no webhook URL is supplied', async () => {
    query.findOne.mockResolvedValue({
      name: 'v1',
      status: ReleaseStatus.UPCOMING,
    } as never);
    const res = await svc.triggerDeploy('p1', 'r1', '', 'u1');
    expect(res.success).toBe(true);
    expect(res.message).toContain('no webhook configured');
    expect(validateWebhookUrl).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });

  it('on SSRF block: audits, rolls status back to UPCOMING, and rethrows', async () => {
    query.findOne.mockResolvedValue({
      name: 'v1',
      description: 'desc',
      status: ReleaseStatus.UPCOMING,
    } as never);
    (validateWebhookUrl as jest.Mock).mockImplementation(() => {
      throw new Error('SSRF blocked');
    });
    await expect(
      svc.triggerDeploy('p1', 'r1', 'http://169.254.169.254', 'u1'),
    ).rejects.toThrow('SSRF blocked');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ failureReason: 'SSRF_BLOCKED' }),
      }),
    );
    expect(command.update).toHaveBeenCalledWith(
      'p1',
      'r1',
      'u1',
      expect.objectContaining({ status: ReleaseStatus.UPCOMING }),
    );
  });

  it('on a valid webhook: audits success and notifies', async () => {
    query.findOne.mockResolvedValue({
      name: 'v1',
      status: ReleaseStatus.UPCOMING,
    } as never);
    (validateWebhookUrl as jest.Mock).mockReturnValue(
      new URL('https://hooks.ci.example.com/deploy'),
    );
    const res = await svc.triggerDeploy(
      'p1',
      'r1',
      'https://hooks.ci.example.com/deploy',
      'u1',
    );
    expect(res.success).toBe(true);
    expect(res.message).toContain('hooks.ci.example.com');
    expect(notifications.notifyWatchersOnEvent).toHaveBeenCalled();
  });

  it('listWebhooks requires membership and returns an array', async () => {
    members.getUserRole.mockResolvedValue(null);
    await expect(svc.listWebhooks('p1', 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    members.getUserRole.mockResolvedValue(ProjectRole.MEMBER);
    await expect(svc.listWebhooks('p1', 'u1')).resolves.toEqual([]);
  });
});
