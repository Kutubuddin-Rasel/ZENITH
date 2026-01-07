import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Notification,
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { SmartDigestService } from './services/smart-digest.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: any;
  let gateway: any;
  let smartDigestService: any;

  const mockNotification = {
    id: 'notif-123',
    userId: 'user-123',
    message: 'Test Message',
    type: NotificationType.INFO,
    status: NotificationStatus.UNREAD,
    createdAt: new Date(),
    read: false,
    context: {},
  };

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const mockGateway = {
      sendToUser: jest.fn(),
      sendDeletionToUser: jest.fn(),
    };

    const mockSmartDigestService = {
      stageNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockRepo },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: SmartDigestService, useValue: mockSmartDigestService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repo = module.get(getRepositoryToken(Notification));
    gateway = module.get(NotificationsGateway);
    smartDigestService = module.get(SmartDigestService);
  });

  describe('createMany', () => {
    it('should stage INFO notifications via SmartDigest', async () => {
      await service.createMany(
        ['user-1'],
        'Info msg',
        {},
        NotificationType.INFO,
      );
      expect(smartDigestService.stageNotification).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ message: 'Info msg' }),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should save and send immediate notifications for non-INFO types', async () => {
      const urgentNotif = { ...mockNotification, type: NotificationType.WARNING };
      // Return what was created, so userId matches
      repo.create.mockImplementation((dto) => ({ ...dto, id: 'new-id' }));
      repo.save.mockImplementation((entities) => Promise.resolve(entities));

      await service.createMany(
        ['user-1'],
        'Urgent msg',
        {},
        NotificationType.WARNING,
      );

      expect(repo.save).toHaveBeenCalled();
      expect(gateway.sendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ message: 'Urgent msg' }),
      );
    });
  });

  describe('markStatus', () => {
    it('should update status and read flag', async () => {
      repo.findOne.mockResolvedValue(mockNotification);
      repo.save.mockImplementation((entity) => Promise.resolve(entity));

      await service.markStatus(
        'user-123',
        'notif-123',
        NotificationStatus.DONE,
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.DONE,
          read: true,
        }),
      );
    });

    it('should do nothing if notification not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.markStatus('u', 'n', NotificationStatus.DONE);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('archiveAll', () => {
    it('should archive all unread notifications', async () => {
      await service.archiveAll('user-123');
      expect(repo.update).toHaveBeenCalledWith(
        { userId: 'user-123', status: NotificationStatus.UNREAD },
        { status: NotificationStatus.DONE, read: true },
      );
    });
  });

  describe('deleteByContext', () => {
    it('should delete matching notifications and notify user', async () => {
      // Create a persistent mock QB for this test
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockNotification]),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb);

      await service.deleteByContext('user-123', { projectId: 'p1' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'notification.context @> :context::jsonb',
        expect.any(Object),
      );
      expect(repo.delete).toHaveBeenCalledWith(['notif-123']);
      expect(gateway.sendDeletionToUser).toHaveBeenCalledWith('user-123', [
        'notif-123',
      ]);
    });
  });

  describe('snooze', () => {
    it('should snooze notification and save snoozedUntil date', async () => {
      repo.findOne.mockResolvedValue(mockNotification);

      await service.snooze('user-123', 'notif-123', 2);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.SNOOZED,
          snoozedUntil: expect.any(Date),
        }),
      );
    });
  });

  describe('unsnooze', () => {
    it('should reset status to UNREAD and notify user', async () => {
      repo.findOne.mockResolvedValue(mockNotification);

      await service.unsnooze('notif-123');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.UNREAD,
          read: false,
          snoozedUntil: undefined,
        }),
      );
      expect(gateway.sendToUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({ unsnoozed: true }),
      );
    });
  });
});
