import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { UsersService } from '../users/users.service';
import { WorkflowStatusesService } from '../workflows/services/workflow-statuses.service';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('ProjectsController', () => {
  let controller: ProjectsController;

  const mockService = {
    create: jest.fn(),
    findAllForUser: jest.fn(),
    findOneById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getSummary: jest.fn(),
    getProjectActivity: jest.fn(),
    getInvites: jest.fn(),
    getAccessSettings: jest.fn(),
    updateAccessSettings: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  const mockStatusesService = {
    findByProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: mockService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: WorkflowStatusesService,
          useValue: mockStatusesService,
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
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
