import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSecuritySettingsService } from './user-security-settings.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CanActivate } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findAll: jest.fn(),
    findAllWithProjectMemberships: jest.fn(),
    search: jest.fn(),
    findUnassigned: jest.fn(),
    create: jest.fn(),
    setActive: jest.fn(),
    update: jest.fn(),
    changePassword: jest.fn(),
    findOneById: jest.fn(),
    deleteAccount: jest.fn(),
  };

  const mockSecuritySettingsService = {
    getOrCreate: jest.fn(),
    update: jest.fn(),
  };

  const mockProjectMembersService = {
    listMembershipsForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: UserSecuritySettingsService, useValue: mockSecuritySettingsService },
        { provide: ProjectMembersService, useValue: mockProjectMembersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
