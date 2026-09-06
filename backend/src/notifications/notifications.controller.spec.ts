import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import {
  NOTIFICATION_INBOX_TOKEN,
  NOTIFICATION_ROUTER_TOKEN,
} from './constants/notifications.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { StatefulCsrfGuard } from '../security/csrf';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  // CQRS split: reads go through the inbox facade, writes through the router.
  const mockInbox = {
    listForUser: jest.fn(),
    listForUserWithCursor: jest.fn(),
    listAllForUser: jest.fn(),
    findOne: jest.fn(),
    getDueSnoozedNotifications: jest.fn(),
  };
  const mockRouter = {
    createMany: jest.fn(),
    markStatus: jest.fn(),
    archiveAll: jest.fn(),
    archive: jest.fn(),
    snooze: jest.fn(),
    unsnooze: jest.fn(),
    deleteByContext: jest.fn(),
    deleteByMessageContent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NOTIFICATION_INBOX_TOKEN, useValue: mockInbox },
        { provide: NOTIFICATION_ROUTER_TOKEN, useValue: mockRouter },
      ],
    })
      .overrideGuard(StatefulCsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
