import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMembersController } from './project-members.controller';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import {
  PROJECT_MEMBER_COMMAND_TOKEN,
  PROJECT_MEMBER_QUERY_TOKEN,
} from '../constants/membership.tokens';

describe('ProjectMembersController', () => {
  let controller: ProjectMembersController;

  const mockQuery = {
    listMembers: jest.fn(),
    getUserRole: jest.fn(),
    getMemberRoleDetails: jest.fn(),
    listMembershipsForUser: jest.fn(),
  };

  const mockCommand = {
    addMember: jest.fn(),
    removeMember: jest.fn(),
    updateMemberRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMembersController],
      providers: [
        { provide: PROJECT_MEMBER_QUERY_TOKEN, useValue: mockQuery },
        { provide: PROJECT_MEMBER_COMMAND_TOKEN, useValue: mockCommand },
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
