import { Test, TestingModule } from '@nestjs/testing';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

describe('BoardsController', () => {
  let controller: BoardsController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getBoardData: jest.fn(),
    createColumn: jest.fn(),
    moveCard: jest.fn(),
  };

  const mockUsersService = {
    findOneById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardsController],
      providers: [
        {
          provide: BoardsService,
          useValue: mockService,
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
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BoardsController>(BoardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
