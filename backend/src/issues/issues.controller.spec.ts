import { Test, TestingModule } from '@nestjs/testing';
import { IssuesController } from './issues.controller';
import { IssuesService, WorkLogsService } from './issues.service';
import { UsersService } from '../users/users.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/casl/policies.guard';
import { Reflector } from '@nestjs/core';

describe('IssuesController', () => {
  let controller: IssuesController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    captureSnapshot: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  const mockWorkLogsService = {
    listWorkLogs: jest.fn(),
    addWorkLog: jest.fn(),
    deleteWorkLog: jest.fn(),
    updateWorkLog: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IssuesController],
      providers: [
        {
          provide: IssuesService,
          useValue: mockService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: WorkLogsService,
          useValue: mockWorkLogsService,
        },
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
      .compile();

    controller = module.get<IssuesController>(IssuesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
