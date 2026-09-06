import { Test, TestingModule } from '@nestjs/testing';
import { SprintsController } from './sprints.controller';
import { UsersService } from '../users/users.service';
import {
  SPRINT_QUERY_TOKEN,
  SPRINT_COMMAND_TOKEN,
  SPRINT_LIFECYCLE_TOKEN,
  SPRINT_MEMBERSHIP_TOKEN,
  SPRINT_METRICS_TOKEN,
} from './constants/sprints.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatefulCsrfGuard } from '../security/csrf';
import { Reflector } from '@nestjs/core';

describe('SprintsController', () => {
  let controller: SprintsController;

  // Step 3: the controller now depends on the ISP tokens, not the
  // concrete `SprintsService`. Each surface is mocked independently.
  const mockSprintQuery = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getSprintIssues: jest.fn(),
    getSprintSnapshots: jest.fn(),
  };
  const mockSprintCommand = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    startSprint: jest.fn(),
  };
  const mockSprintLifecycle = { archive: jest.fn() };
  const mockSprintMembership = {
    addIssue: jest.fn(),
    removeIssue: jest.fn(),
  };
  const mockSprintMetrics = {
    getVelocity: jest.fn(),
    getBurndown: jest.fn(),
    getBurnup: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintsController],
      providers: [
        { provide: SPRINT_QUERY_TOKEN, useValue: mockSprintQuery },
        { provide: SPRINT_COMMAND_TOKEN, useValue: mockSprintCommand },
        { provide: SPRINT_LIFECYCLE_TOKEN, useValue: mockSprintLifecycle },
        { provide: SPRINT_MEMBERSHIP_TOKEN, useValue: mockSprintMembership },
        { provide: SPRINT_METRICS_TOKEN, useValue: mockSprintMetrics },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        Reflector,
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProjectRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SprintsController>(SprintsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
