import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { VirusScanningService } from './services/virus-scanning.service';
import {
  ATTACHMENT_COMMAND_TOKEN,
  ATTACHMENT_QUERY_TOKEN,
  FILE_STORAGE_PROVIDER,
} from './constants/attachments.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

describe('AttachmentsController', () => {
  let controller: AttachmentsController;

  // Controller now depends on the CQRS ports + storage port, not the god-class.
  const mockQuery = {
    listForTarget: jest.fn(),
    getHistory: jest.fn(),
    findForDownload: jest.fn(),
  };
  const mockCommand = {
    createForTarget: jest.fn(),
    removeForTarget: jest.fn(),
  };
  const mockStorage = {
    upload: jest.fn(),
    getDownloadUrl: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };

  // Controller pre-scans uploads; stub reports every file clean.
  const mockVirusScanner = {
    scanFile: jest.fn().mockResolvedValue({ isInfected: false, viruses: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        { provide: ATTACHMENT_QUERY_TOKEN, useValue: mockQuery },
        { provide: ATTACHMENT_COMMAND_TOKEN, useValue: mockCommand },
        { provide: FILE_STORAGE_PROVIDER, useValue: mockStorage },
        { provide: VirusScanningService, useValue: mockVirusScanner },
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttachmentsController>(AttachmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes a project list through the query port', async () => {
    mockQuery.listForTarget.mockResolvedValue([]);
    await controller.findAllProject('p1', { user: { userId: 'u1' } } as never);
    expect(mockQuery.listForTarget).toHaveBeenCalledWith({
      target: 'project',
      projectId: 'p1',
      userId: 'u1',
    });
  });

  it('routes a comment delete through the command port with the comment context', async () => {
    mockCommand.removeForTarget.mockResolvedValue(undefined);
    await controller.removeComment('p1', 'i1', 'c1', 'a1', {
      user: { userId: 'u1' },
    } as never);
    expect(mockCommand.removeForTarget).toHaveBeenCalledWith(
      {
        target: 'comment',
        projectId: 'p1',
        issueId: 'i1',
        parentId: 'c1',
        userId: 'u1',
      },
      'a1',
    );
  });
});
