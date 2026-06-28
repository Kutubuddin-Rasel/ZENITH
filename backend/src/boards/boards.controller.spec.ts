import { CacheInterceptor, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

import { BoardsController } from './boards.controller';
import {
  BOARD_COLUMN_COMMAND_TOKEN,
  BOARD_COMMAND_TOKEN,
  BOARD_ORDERING_COMMAND_TOKEN,
  BOARD_QUERY_TOKEN,
} from './constants/boards.tokens';

/**
 * BoardsController — DI smoke test post-Step-3 commit 6.
 *
 * The four ISP tokens replace the previous concrete `BoardsService`
 * + `UsersService` providers. CSRF + Auth + Permissions guards are
 * stubbed to `canActivate: () => true` so the test module compiles
 * without dragging in their dependency chains (CSRF_*_TOKEN, JWT
 * strategy, RBAC seeds).
 */
describe('BoardsController', () => {
  let controller: BoardsController;

  const queryMock = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findOneWithIssues: jest.fn(),
  };
  const commandMock = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const columnCommandMock = {
    addColumn: jest.fn(),
    updateColumn: jest.fn(),
    removeColumn: jest.fn(),
  };
  const orderingMock = {
    reorderColumns: jest.fn(),
    moveIssue: jest.fn(),
    reorderIssues: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardsController],
      providers: [
        { provide: BOARD_QUERY_TOKEN, useValue: queryMock },
        { provide: BOARD_COMMAND_TOKEN, useValue: commandMock },
        { provide: BOARD_COLUMN_COMMAND_TOKEN, useValue: columnCommandMock },
        { provide: BOARD_ORDERING_COMMAND_TOKEN, useValue: orderingMock },
        // CacheInterceptor (decorated on the GET routes) needs CACHE_MANAGER;
        // stubbed with no-ops so the controller instantiates without dragging
        // in `@nestjs/cache-manager`'s full provider chain.
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        Reflector,
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CacheInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<BoardsController>(BoardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
