import { Test, TestingModule } from '@nestjs/testing';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { UsersService } from '../users/users.service';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../auth/guards/project-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('SprintsController', () => {
  let controller: SprintsController;

  const mockSprintsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    remove: jest.fn(),
    addIssue: jest.fn(),
    removeIssue: jest.fn(),
    getSprintIssues: jest.fn(),
    startSprint: jest.fn(),
    getBurndown: jest.fn(),
    getVelocity: jest.fn(),
    getBurnup: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SprintsController],
      providers: [
        {
          provide: SprintsService,
          useValue: mockSprintsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
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

    controller = module.get<SprintsController>(SprintsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
