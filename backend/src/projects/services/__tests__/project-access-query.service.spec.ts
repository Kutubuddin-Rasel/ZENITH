import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { ProjectAccessSettingsRepository } from '../../../database/repositories/project-access-settings.repository';

import { PROJECT_QUERY_TOKEN } from '../../constants/projects.tokens';
import { ProjectAccessQueryService } from '../project-access-query.service';

describe('ProjectAccessQueryService', () => {
  let service: ProjectAccessQueryService;

  const projects = { findById: jest.fn() };
  const settingsRepo = {
    findByProject: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAccessQueryService,
        { provide: PROJECT_QUERY_TOKEN, useValue: projects },
        { provide: ProjectAccessSettingsRepository, useValue: settingsRepo },
      ],
    }).compile();

    service = module.get(ProjectAccessQueryService);
  });

  it('gates the read through IProjectQuery for tenant validation', async () => {
    projects.findById.mockRejectedValue(new NotFoundException());

    await expect(
      service.getAccessSettings('cross-tenant-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(settingsRepo.findByProject).not.toHaveBeenCalled();
  });

  it('returns existing settings when present', async () => {
    projects.findById.mockResolvedValue({ id: 'p1' });
    settingsRepo.findByProject.mockResolvedValue({
      id: 's1',
      projectId: 'p1',
      accessControlEnabled: true,
      defaultPolicy: 'DENY',
      ipAllowlist: ['10.0.0.0/8'],
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

    const view = await service.getAccessSettings('p1');

    expect(view.ipAllowlist).toEqual(['10.0.0.0/8']);
    expect(settingsRepo.create).not.toHaveBeenCalled();
  });

  it('lazy-creates a defaults row when no settings exist', async () => {
    projects.findById.mockResolvedValue({ id: 'p1' });
    settingsRepo.findByProject.mockResolvedValue(null);
    const draft = {
      id: 's-new',
      projectId: 'p1',
      accessControlEnabled: false,
      defaultPolicy: 'ALLOW',
      ipAllowlist: null,
      countryAllowlist: null,
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
    settingsRepo.save.mockResolvedValue(draft);

    const view = await service.getAccessSettings('p1');

    expect(settingsRepo.create).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(settingsRepo.save).toHaveBeenCalled();
    expect(view.ipAllowlist).toEqual([]);
    expect(view.countryAllowlist).toEqual([]);
  });
});
