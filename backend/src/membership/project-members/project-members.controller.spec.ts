import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Reflector } from '@nestjs/core';

describe('ProjectMembersController', () => {
  let controller: ProjectMembersController;

  const mockService = {
    addMemberToProject: jest.fn(),
    removeMemberFromProject: jest.fn(),
    listMembers: jest.fn(),
    getUserRole: jest.fn(),
    updateMemberRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMembersController],
      providers: [
        {
          provide: ProjectMembersService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectMembersController>(ProjectMembersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
