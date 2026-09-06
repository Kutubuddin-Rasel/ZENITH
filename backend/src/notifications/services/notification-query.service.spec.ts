import { Test, TestingModule } from '@nestjs/testing';
import { NotificationQueryService } from './notification-query.service';
import { NOTIFICATION_REPOSITORY_TOKEN } from '../constants/notifications.tokens';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../entities/notification.entity';

// ---------------------------------------------------------------------------
// Strict Mock Types (ZERO `any`)
// ---------------------------------------------------------------------------

interface MockRepo {
  findForUser: jest.Mock;
  findFeedKeyset: jest.Mock;
  findAllForUser: jest.Mock;
  findById: jest.Mock;
  findDueSnoozed: jest.Mock;
}

const entity = (overrides?: Partial<Notification>): Notification =>
  ({
    id: 'notif-1',
    userId: 'user-1',
    organizationId: 'org-1',
    message: 'Hello',
    context: { projectId: 'p1' },
    type: NotificationType.WARNING,
    status: NotificationStatus.UNREAD,
    read: false,
    snoozedUntil: undefined,
    createdAt: new Date('2026-06-07T00:00:00.000Z'),
    ...overrides,
  }) as Notification;

describe('NotificationQueryService', () => {
  let service: NotificationQueryService;
  let repo: MockRepo;

  beforeEach(async () => {
    const mockRepo: MockRepo = {
      findForUser: jest.fn().mockResolvedValue([]),
      findFeedKeyset: jest
        .fn()
        .mockResolvedValue({ data: [], nextCursor: null }),
      findAllForUser: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findDueSnoozed: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationQueryService,
        { provide: NOTIFICATION_REPOSITORY_TOKEN, useValue: mockRepo },
      ],
    }).compile();

    service = module.get(NotificationQueryService);
    repo = module.get(NOTIFICATION_REPOSITORY_TOKEN);
  });

  it('maps entities to NotificationView (no ORM leakage) in listForUser', async () => {
    repo.findForUser.mockResolvedValue([entity({ id: 'a' })]);

    const result = await service.listForUser(
      'user-1',
      NotificationStatus.UNREAD,
    );

    expect(repo.findForUser).toHaveBeenCalledWith(
      'user-1',
      NotificationStatus.UNREAD,
      undefined,
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 'a', message: 'Hello' }),
    ]);
    // The returned view is a plain projection, never the entity instance.
    expect(result[0]).not.toBeInstanceOf(Notification);
  });

  it('maps the keyset page data and preserves the cursor', async () => {
    repo.findFeedKeyset.mockResolvedValue({
      data: [entity({ id: 'b' })],
      nextCursor: 'cursor-xyz',
    });

    const page = await service.listForUserWithCursor(
      'user-1',
      NotificationStatus.UNREAD,
      undefined,
      20,
    );

    expect(page.nextCursor).toBe('cursor-xyz');
    expect(page.data).toEqual([expect.objectContaining({ id: 'b' })]);
  });

  it('listAllForUser maps every row', async () => {
    repo.findAllForUser.mockResolvedValue([
      entity({ id: 'c' }),
      entity({ id: 'd' }),
    ]);
    const result = await service.listAllForUser('user-1');
    expect(result.map((n) => n.id)).toEqual(['c', 'd']);
  });

  it('findOne returns null when the repository finds nothing', async () => {
    repo.findById.mockResolvedValue(null);
    expect(await service.findOne('missing')).toBeNull();
  });

  it('getDueSnoozedNotifications maps the sweep result', async () => {
    repo.findDueSnoozed.mockResolvedValue([entity({ id: 'e' })]);
    const due = await service.getDueSnoozedNotifications();
    expect(repo.findDueSnoozed).toHaveBeenCalledWith(expect.any(Date));
    expect(due).toEqual([expect.objectContaining({ id: 'e' })]);
  });
});
