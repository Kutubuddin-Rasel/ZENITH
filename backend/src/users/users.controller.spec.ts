import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('UsersController', () => {
  let controller: UsersController;

  // Step 3: password rotation moved to `UserPasswordController` (auth).
  // Step 4: security settings + login history moved to auth.
  // Step 6: avatar upload moved to `AvatarController` (storage); the user
  // project-membership read moved to `UserProjectMembershipsController`
  // (membership). The `ProjectMembersService` mock is no longer needed.
  const mockUsersService = {
    findAll: jest.fn(),
    findAllWithProjectMemberships: jest.fn(),
    search: jest.fn(),
    findUnassigned: jest.fn(),
    create: jest.fn(),
    setActive: jest.fn(),
    update: jest.fn(),
    findOneById: jest.fn(),
    deleteAccount: jest.fn(),
    verifyEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
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
