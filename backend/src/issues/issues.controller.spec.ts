import { Test, TestingModule } from '@nestjs/testing';
import { IssuesController } from './issues.controller';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/casl/policies.guard';
import { StatefulCsrfGuard } from '../security/csrf';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

// SOLID Refactor (Step 3): the controller injects the ISP tokens, so the
// spec provides mocks against those tokens (not the concrete services).
import {
  ISSUE_COMMAND_TOKEN,
  ISSUE_IMPORT_TOKEN,
  ISSUE_LINK_TOKEN,
  ISSUE_QUERY_TOKEN,
  ISSUE_TRANSITION_TOKEN,
  WORKLOG_COMMAND_TOKEN,
  WORKLOG_QUERY_TOKEN,
} from './constants/issues.tokens';

describe('IssuesController', () => {
  let controller: IssuesController;

  const mockQuery = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getLinks: jest.fn(),
    getIssuesStream: jest.fn(),
  };

  const mockCommand = {
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    remove: jest.fn(),
    updateLabels: jest.fn(),
  };

  const mockTransition = {
    updateStatus: jest.fn(),
    moveIssue: jest.fn(),
  };

  const mockLink = {
    addLink: jest.fn(),
    removeLink: jest.fn(),
  };

  const mockImport = {
    importIssues: jest.fn(),
  };

  const mockWorklogQuery = {
    listWorkLogs: jest.fn(),
    getTotalTimeByIssue: jest.fn(),
    getTotalTimeByProject: jest.fn(),
    getTotalTimeByUser: jest.fn(),
    getTotalTimeBySprint: jest.fn(),
  };

  const mockWorklogCommand = {
    addWorkLog: jest.fn(),
    deleteWorkLog: jest.fn(),
    updateWorkLog: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IssuesController],
      providers: [
        { provide: ISSUE_QUERY_TOKEN, useValue: mockQuery },
        { provide: ISSUE_COMMAND_TOKEN, useValue: mockCommand },
        { provide: ISSUE_TRANSITION_TOKEN, useValue: mockTransition },
        { provide: ISSUE_LINK_TOKEN, useValue: mockLink },
        { provide: ISSUE_IMPORT_TOKEN, useValue: mockImport },
        { provide: WORKLOG_QUERY_TOKEN, useValue: mockWorklogQuery },
        { provide: WORKLOG_COMMAND_TOKEN, useValue: mockWorklogCommand },
        Reflector,
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProjectRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IssuesController>(IssuesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
