/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { AuditLogsService } from '../../../audit/audit-logs.service';
import { AuditLogWriterAdapter } from '../audit-log-writer.adapter';

describe('AuditLogWriterAdapter', () => {
  let adapter: AuditLogWriterAdapter;

  const auditLogsService = { log: jest.fn() };
  const cls = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogWriterAdapter,
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    adapter = module.get(AuditLogWriterAdapter);
  });

  it('maps narrow DTO onto legacy AuditLogEvent shape with both alias forms', async () => {
    cls.get.mockReturnValue('req-abc');

    await adapter.log({
      tenantId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Project',
      resourceId: 'p-1',
      actionType: 'CREATE',
      action: 'PROJECT_CREATED',
      projectId: 'p-1',
      severity: 'MEDIUM',
      metadata: { projectName: 'Alpha' },
    });

    expect(auditLogsService.log).toHaveBeenCalledTimes(1);
    const event = auditLogsService.log.mock.calls[0][0];
    expect(event).toEqual(
      expect.objectContaining({
        tenant_id: 'org-1',
        actor_id: 'user-1',
        resource_type: 'Project',
        resource_id: 'p-1',
        action_type: 'CREATE',
        action: 'PROJECT_CREATED',
        projectId: 'p-1',
      }),
    );
    expect(typeof event.event_uuid).toBe('string');
    expect(event.event_uuid).toHaveLength(36); // uuid v4
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.metadata).toEqual(
      expect.objectContaining({
        projectName: 'Alpha',
        severity: 'MEDIUM',
        requestId: 'req-abc',
      }),
    );
  });

  it('omits requestId metadata when CLS is empty', async () => {
    cls.get.mockReturnValue(undefined);

    await adapter.log({
      tenantId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Project',
      resourceId: 'p-1',
      actionType: 'UPDATE',
      action: 'PROJECT_UPDATED',
    });

    const event = auditLogsService.log.mock.calls[0][0];
    expect(event.metadata.requestId).toBeUndefined();
  });

  it('clones the changes tuple into a mutable record', async () => {
    cls.get.mockReturnValue(undefined);

    await adapter.log({
      tenantId: 'org-1',
      actorId: 'user-1',
      resourceType: 'Project',
      resourceId: 'p-1',
      actionType: 'UPDATE',
      action: 'PROJECT_UPDATED',
      changes: { name: ['Old', 'New'] as const },
    });

    const event = auditLogsService.log.mock.calls[0][0];
    expect(event.changes).toEqual({ name: ['Old', 'New'] });
  });

  it('swallows CLS errors gracefully (no propagation to caller)', async () => {
    cls.get.mockImplementation(() => {
      throw new Error('no-context');
    });

    await expect(
      adapter.log({
        tenantId: 'org-1',
        actorId: 'user-1',
        resourceType: 'Project',
        resourceId: 'p-1',
        actionType: 'CREATE',
        action: 'PROJECT_CREATED',
      }),
    ).resolves.toBeUndefined();
  });
});
