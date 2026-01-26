import { Test, TestingModule } from '@nestjs/testing';
import { WatchersController } from './watchers.controller';
import { WatchersService } from './watchers.service';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';

describe('WatchersController', () => {
  let controller: WatchersController;

  const mockService = {
    addWatcher: jest.fn(),
    removeWatcher: jest.fn(),
    getWatchers: jest.fn(),
    notifyWatchers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchersController],
      providers: [
        {
          provide: WatchersService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WatchersController>(WatchersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
