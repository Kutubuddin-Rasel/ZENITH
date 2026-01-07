import { Test, TestingModule } from '@nestjs/testing';
import { BacklogController } from './backlog.controller';
import { BacklogService } from './backlog.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

describe('BacklogController', () => {
  let controller: BacklogController;

  const mockService = {
    getBacklog: jest.fn(),
    moveItem: jest.fn(),
    reorderItems: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BacklogController],
      providers: [
        {
          provide: BacklogService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BacklogController>(BacklogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
