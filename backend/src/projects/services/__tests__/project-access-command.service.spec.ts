/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';

import { ProjectAccessSettingsRepository } from '../../../database/repositories/project-access-settings.repository';

import {
  AUDIT_LOG_WRITER_TOKEN,
  PROJECT_ACCESS_QUERY_TOKEN,
  PROJECT_QUERY_TOKEN,
} from '../../constants/projects.tokens';
import { ProjectAccessCommandService } from '../project-access-command.service';

describe('ProjectAccessCommandService', () => {
  let service: ProjectAccessCommandService;

  const projects = { findById: jest.fn() };
  const accessQuery = { getAccessSettings: jest.fn() };
  const settingsRepo = {
    findByProject: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const auditWriter = { log: jest.fn() };
  const cls = { get: jest.fn<string | undefined, [string]>() };

  beforeEach(async () => {
    jest.clearAllMocks();
    cls.get.mockReturnValue('user-1');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAccessCommandService,
        { provide: PROJECT_QUERY_TOKEN, useValue: projects },
        { provide: PROJECT_ACCESS_QUERY_TOKEN, useValue: accessQuery },
        { provide: ProjectAccessSettingsRepository, useValue: settingsRepo },
        { provide: AUDIT_LOG_WRITER_TOKEN, useValue: auditWriter },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    service = module.get(ProjectAccessCommandService);
  });

  it('merges patch onto existing settings (undefined fields skipped)', async () => {
    projects.findById.mockResolvedValue({
      id: 'p1',
      name: 'Alpha',
      organizationId: 'org-1',
    });
    const existing = {
      id: 's1',
      projectId: 'p1',
      accessControlEnabled: false,
      defaultPolicy: 'ALLOW',
      ipAllowlist: [],
      countryAllowlist: [],
      geographicFiltering: false,
      timeBasedFiltering: false,
      emergencyAccessEnabled: false,
      userSpecificRules: false,
      roleBasedRules: false,
      maxRulesPerUser: 100,
      autoCleanupEnabled: false,
      cleanupIntervalHours: 24,
      notificationEnabled: true,
      logAllAccess: false,
      requireApprovalForNewRules: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    settingsRepo.findByProject.mockResolvedValue(existing);
    settingsRepo.save.mockImplementation(async (e: typeof existing) => e);

    await service.updateAccessSettings('p1', {
      accessControlEnabled: true,
      ipAllowlist: ['10.0.0.0/8'],
    });

    expect(existing.accessControlEnabled).toBe(true);
    expect(existing.ipAllowlist).toEqual(['10.0.0.0/8']);
    expect(existing.defaultPolicy).toBe('ALLOW'); // untouched
  });

  it('emits HIGH-severity audit with changedSettings field list', async () => {
    projects.findById.mockResolvedValue({
      id: 'p1',
      name: 'Alpha',
      organizationId: 'org-1',
    });
    settingsRepo.findByProject.mockResolvedValue({
      id: 's1',
      projectId: 'p1',
      accessControlEnabled: false,
      defaultPolicy: 'ALLOW',
      ipAllowlist: [],
      countryAllowlist: [],
      geographicFiltering: false,
      timeBasedFiltering: false,
      emergencyAccessEnabled: false,
      userSpecificRules: false,
      roleBasedRules: false,
      maxRulesPerUser: 100,
      autoCleanupEnabled: false,
      cleanupIntervalHours: 24,
      notificationEnabled: true,
      logAllAccess: false,
      requireApprovalForNewRules: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    settingsRepo.save.mockImplementation(async (e: unknown) => e);

    await service.updateAccessSettings('p1', {
      accessControlEnabled: true,
      defaultPolicy: 'DENY',
    });

    expect(auditWriter.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACCESS_SETTINGS_UPDATED',
        severity: 'HIGH',
        actorId: 'user-1',
        metadata: expect.objectContaining({
          changedSettings: ['accessControlEnabled', 'defaultPolicy'],
        }),
      }),
    );
  });

  it('lazy-creates settings when none exist before applying patch', async () => {
    projects.findById.mockResolvedValue({
      id: 'p1',
      name: 'Alpha',
      organizationId: 'org-1',
    });
    settingsRepo.findByProject.mockResolvedValue(null);
    const draft = {
      id: 's-new',
      projectId: 'p1',
      accessControlEnabled: false,
      defaultPolicy: 'ALLOW',
      ipAllowlist: [],
      countryAllowlist: [],
      geographicFiltering: false,
      timeBasedFiltering: false,
      emergencyAccessEnabled: false,
      userSpecificRules: false,
      roleBasedRules: false,
      maxRulesPerUser: 0,
      autoCleanupEnabled: false,
      cleanupIntervalHours: 0,
      notificationEnabled: false,
      logAllAccess: false,
      requireApprovalForNewRules: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    settingsRepo.create.mockReturnValue(draft);
    settingsRepo.save.mockImplementation(async (e: typeof draft) => e);

    await service.updateAccessSettings('p1', { accessControlEnabled: true });

    expect(settingsRepo.create).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(draft.accessControlEnabled).toBe(true);
  });

  it('falls back to "system" actor when CLS has no userId', async () => {
    cls.get.mockReturnValue(undefined);
    projects.findById.mockResolvedValue({
      id: 'p1',
      name: 'Alpha',
      organizationId: 'org-1',
    });
    settingsRepo.findByProject.mockResolvedValue({
      id: 's1',
      projectId: 'p1',
      accessControlEnabled: false,
      defaultPolicy: 'ALLOW',
      ipAllowlist: [],
      countryAllowlist: [],
      geographicFiltering: false,
      timeBasedFiltering: false,
      emergencyAccessEnabled: false,
      userSpecificRules: false,
      roleBasedRules: false,
      maxRulesPerUser: 0,
      autoCleanupEnabled: false,
      cleanupIntervalHours: 0,
      notificationEnabled: false,
      logAllAccess: false,
      requireApprovalForNewRules: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    settingsRepo.save.mockImplementation(async (e: unknown) => e);

    await service.updateAccessSettings('p1', { accessControlEnabled: true });

    expect(auditWriter.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'system' }),
    );
  });
});
