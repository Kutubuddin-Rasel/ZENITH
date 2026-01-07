import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockService = {
    listForUser: jest.fn(),
    listAllForUser: jest.fn(),
    markStatus: jest.fn(),
    archiveAll: jest.fn(),
    createMany: jest.fn(),
    snooze: jest.fn(),
    archive: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
