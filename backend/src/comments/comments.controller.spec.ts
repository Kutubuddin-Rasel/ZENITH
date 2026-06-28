import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import {
  COMMENT_QUERY_TOKEN,
  COMMENT_COMMAND_TOKEN,
} from './constants/comments.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

describe('CommentsController', () => {
  let controller: CommentsController;
  let query: any;
  let command: any;

  const req = { user: { userId: 'u1' } } as any;

  beforeEach(async () => {
    query = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      findAllKeyset: jest
        .fn()
        .mockResolvedValue({ data: [], nextCursor: null }),
      assertEditable: jest.fn(),
    };
    command = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        { provide: COMMENT_QUERY_TOKEN, useValue: query },
        { provide: COMMENT_COMMAND_TOKEN, useValue: command },
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommentsController>(CommentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET uses offset pagination when no cursor is supplied', async () => {
    await controller.findAll('p1', 'i1', { page: 2, limit: 10 } as any, req);
    expect(query.findAll).toHaveBeenCalledWith('p1', 'i1', 'u1', {
      page: 2,
      limit: 10,
    });
    expect(query.findAllKeyset).not.toHaveBeenCalled();
  });

  it('GET uses keyset pagination when a cursor is supplied', async () => {
    await controller.findAll(
      'p1',
      'i1',
      { page: 1, limit: 10, cursor: 'tok' } as any,
      req,
    );
    expect(query.findAllKeyset).toHaveBeenCalledWith(
      'p1',
      'i1',
      'u1',
      10,
      'tok',
    );
    expect(query.findAll).not.toHaveBeenCalled();
  });

  it('delegates writes to the command surface', async () => {
    await controller.create('p1', 'i1', { content: 'hi' } as any, req);
    expect(command.create).toHaveBeenCalledWith('p1', 'i1', 'u1', {
      content: 'hi',
    });
  });
});
