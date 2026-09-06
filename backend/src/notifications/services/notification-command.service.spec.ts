import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCommandService } from './notification-command.service';
import { SmartDigestService } from './smart-digest.service';
import { RealtimeTransportPort } from '../ports/realtime-transport.port';
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
  createEntities: jest.Mock;
  save: jest.Mock;
  saveOne: jest.Mock;
  findOneForUser: jest.Mock;
  findById: jest.Mock;
  archiveAllUnread: jest.Mock;
  archiveOne: jest.Mock;
  deleteByContext: jest.Mock;
  deleteByMessageLike: jest.Mock;
}
interface MockRealtime {
  sendToUser: jest.Mock;
  sendDeletionToUser: jest.Mock;
  sendUpdateToUser: jest.Mock;
}
interface MockSmartDigest {
  stageNotification: jest.Mock;
}

const entity = (overrides?: Partial<Notification>): Notification =>
  ({
    id: 'notif-1',
    userId: 'user-1',
    organizationId: 'org-1',
    message: 'Test Message',
    context: {},
    type: NotificationType.WARNING,
    status: NotificationStatus.UNREAD,
    read: false,
    snoozedUntil: undefined,
    createdAt: new Date('2026-06-07T00:00:00.000Z'),
    ...overrides,
  }) as Notification;

describe('NotificationCommandService', () => {
  let service: NotificationCommandService;
  let repo: MockRepo;
  let realtime: MockRealtime;
  let smartDigest: MockSmartDigest;

  beforeEach(async () => {
    const mockRepo: MockRepo = {
      createEntities: jest.fn(),
      save: jest.fn(),
      saveOne: jest.fn((n: Notification) => Promise.resolve(n)),
      findOneForUser: jest.fn(),
      findById: jest.fn(),
      archiveAllUnread: jest.fn().mockResolvedValue(undefined),
      archiveOne: jest.fn().mockResolvedValue(undefined),
      deleteByContext: jest.fn().mockResolvedValue([]),
      deleteByMessageLike: jest.fn().mockResolvedValue([]),
    };
    const mockRealtime: MockRealtime = {
      sendToUser: jest.fn(),
      sendDeletionToUser: jest.fn(),
      sendUpdateToUser: jest.fn(),
    };
    const mockSmartDigest: MockSmartDigest = {
      stageNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationCommandService,
        { provide: NOTIFICATION_REPOSITORY_TOKEN, useValue: mockRepo },
        { provide: RealtimeTransportPort, useValue: mockRealtime },
        { provide: SmartDigestService, useValue: mockSmartDigest },
      ],
    }).compile();

    service = module.get(NotificationCommandService);
    repo = module.get(NOTIFICATION_REPOSITORY_TOKEN);
    realtime = module.get(RealtimeTransportPort);
    smartDigest = module.get(SmartDigestService);
  });

  describe('createMany', () => {
    it('stages INFO notifications via SmartDigest (no persistence, no transport)', async () => {
      const result = await service.createMany(
        ['user-1'],
        'Info msg',
        {},
        NotificationType.INFO,
      );

      expect(smartDigest.stageNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ message: 'Info msg' }),
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(realtime.sendToUser).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('persists non-INFO notifications and emits via the realtime PORT', async () => {
      repo.createEntities.mockReturnValue([entity({ message: 'Urgent msg' })]);
      repo.save.mockResolvedValue([entity({ message: 'Urgent msg' })]);

      await service.createMany(
        ['user-1'],
        'Urgent msg',
        {},
        NotificationType.WARNING,
      );

      expect(repo.save).toHaveBeenCalled();
      // Transport flows through RealtimeTransportPort — never the gateway directly.
      expect(realtime.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ message: 'Urgent msg' }),
      );
    });
  });

  describe('markStatus', () => {
    it('updates status and syncs the legacy read flag', async () => {
      repo.findOneForUser.mockResolvedValue(entity());

      await service.markStatus('user-1', 'notif-1', NotificationStatus.DONE);

      expect(repo.saveOne).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.DONE,
          read: true,
        }),
      );
    });

    it('does nothing when the notification is not found', async () => {
      repo.findOneForUser.mockResolvedValue(null);
      await service.markStatus('u', 'n', NotificationStatus.DONE);
      expect(repo.saveOne).not.toHaveBeenCalled();
    });
  });

  describe('archiveAll', () => {
    it('delegates to the repository bulk archive', async () => {
      await service.archiveAll('user-1');
      expect(repo.archiveAllUnread).toHaveBeenCalledWith('user-1');
    });
  });

  describe('deleteByContext', () => {
    it('emits a deletion event when rows are removed', async () => {
      repo.deleteByContext.mockResolvedValue(['notif-1']);

      await service.deleteByContext('user-1', { projectId: 'p1' });

      expect(realtime.sendDeletionToUser).toHaveBeenCalledWith('user-1', [
        'notif-1',
      ]);
    });

    it('skips the deletion event when nothing matched', async () => {
      repo.deleteByContext.mockResolvedValue([]);
      await service.deleteByContext('user-1', { projectId: 'p1' });
      expect(realtime.sendDeletionToUser).not.toHaveBeenCalled();
    });
  });

  describe('snooze', () => {
    it('sets SNOOZED + snoozedUntil and persists', async () => {
      repo.findOneForUser.mockResolvedValue(entity());

      const result = await service.snooze('user-1', 'notif-1', 2);

      expect(repo.saveOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: NotificationStatus.SNOOZED }),
      );
      // The returned view carries the computed snooze deadline.
      expect(result?.snoozedUntil).toBeInstanceOf(Date);
    });
  });

  describe('unsnooze', () => {
    it('resets to UNREAD and re-emits with unsnoozed:true', async () => {
      repo.findById.mockResolvedValue(
        entity({ status: NotificationStatus.SNOOZED }),
      );

      await service.unsnooze('notif-1');

      expect(repo.saveOne).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.UNREAD,
          read: false,
          snoozedUntil: undefined,
        }),
      );
      expect(realtime.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ unsnoozed: true }),
      );
    });
  });
});
