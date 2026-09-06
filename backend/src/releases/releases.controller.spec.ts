import { Test, TestingModule } from '@nestjs/testing';
import { ReleasesController } from './releases.controller';
import {
  RELEASE_QUERY_TOKEN,
  RELEASE_COMMAND_TOKEN,
  RELEASE_DEPLOYMENT_TOKEN,
  RELEASE_NOTES_TOKEN,
} from './constants/releases.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

describe('ReleasesController', () => {
  let controller: ReleasesController;

  // The controller is a thin adapter over the four segregated tokens.
  const mockQuery = {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAllPaginated: jest.fn(),
    getIssues: jest.fn(),
    getAttachments: jest.fn(),
    getGitInfo: jest.fn(),
    compareReleases: jest.fn(),
    getLatestVersion: jest.fn(),
    suggestNextVersion: jest.fn(),
  };
  const mockCommand = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    archive: jest.fn(),
    assignIssue: jest.fn(),
    unassignIssue: jest.fn(),
    addAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    linkGit: jest.fn(),
    generateAndSaveReleaseNotes: jest.fn(),
    createRollback: jest.fn(),
  };
  const mockDeployment = {
    triggerDeploy: jest.fn(),
    listWebhooks: jest.fn(),
  };
  const mockNotes = { generateReleaseNotes: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReleasesController],
      providers: [
        { provide: RELEASE_QUERY_TOKEN, useValue: mockQuery },
        { provide: RELEASE_COMMAND_TOKEN, useValue: mockCommand },
        { provide: RELEASE_DEPLOYMENT_TOKEN, useValue: mockDeployment },
        { provide: RELEASE_NOTES_TOKEN, useValue: mockNotes },
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReleasesController>(ReleasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes create → command', async () => {
    mockCommand.create.mockResolvedValue({ id: 'r1' });
    await controller.create('p1', { name: 'v1.0.0' } as never, {
      user: { userId: 'u1' } as never,
    });
    expect(mockCommand.create).toHaveBeenCalledWith('p1', 'u1', {
      name: 'v1.0.0',
    });
  });

  it('routes findAll → query.findAllPaginated', async () => {
    mockQuery.findAllPaginated.mockResolvedValue({ data: [] });
    const q = {} as never;
    await controller.findAll('p1', q, { user: { userId: 'u1' } as never });
    expect(mockQuery.findAllPaginated).toHaveBeenCalledWith('p1', 'u1', q);
  });

  it('routes triggerDeploy → deployment', async () => {
    mockDeployment.triggerDeploy.mockResolvedValue({ success: true });
    await controller.triggerDeploy(
      'p1',
      'r1',
      { webhookId: 'https://x' },
      {
        user: { userId: 'u1' } as never,
      },
    );
    expect(mockDeployment.triggerDeploy).toHaveBeenCalledWith(
      'p1',
      'r1',
      'https://x',
      'u1',
    );
  });

  it('routes generateNotes → notes', async () => {
    mockNotes.generateReleaseNotes.mockResolvedValue({
      notes: '',
      issueCount: 0,
    });
    await controller.generateNotes('p1', 'r1', {
      user: { userId: 'u1' } as never,
    });
    expect(mockNotes.generateReleaseNotes).toHaveBeenCalledWith(
      'p1',
      'r1',
      'u1',
    );
  });
});
