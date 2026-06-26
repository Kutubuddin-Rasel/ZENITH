import { Test, TestingModule } from '@nestjs/testing';
import { BacklogController } from './backlog.controller';
import {
  BACKLOG_QUERY_TOKEN,
  BACKLOG_ORDERING_TOKEN,
} from './constants/backlog.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

describe('BacklogController', () => {
  let controller: BacklogController;

  const mockQuery = { getBacklog: jest.fn() };
  const mockOrdering = { moveItem: jest.fn(), reorderItems: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacklogController],
      providers: [
        { provide: BACKLOG_QUERY_TOKEN, useValue: mockQuery },
        { provide: BACKLOG_ORDERING_TOKEN, useValue: mockOrdering },
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BacklogController>(BacklogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates getBacklog to the query token', async () => {
    const req = { user: { userId: 'u1' } } as never;
    await controller.getBacklog('p1', {}, req);
    expect(mockQuery.getBacklog).toHaveBeenCalledWith('p1', 'u1', {});
  });

  it('delegates move/reorder to the ordering token', async () => {
    const req = { user: { userId: 'u1' } } as never;
    await controller.move('p1', { issueId: 'i1', newPosition: 2 }, req);
    expect(mockOrdering.moveItem).toHaveBeenCalledWith('p1', 'u1', {
      issueId: 'i1',
      newPosition: 2,
    });

    await controller.reorder('p1', { issueIds: ['a', 'b'] }, req);
    expect(mockOrdering.reorderItems).toHaveBeenCalledWith('p1', 'u1', [
      'a',
      'b',
    ]);
  });
});
