import { Test, TestingModule } from '@nestjs/testing';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';

describe('ReleasesController', () => {
  let controller: ReleasesController;

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    assignIssue: jest.fn(),
    unassignIssue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReleasesController],
      providers: [
        {
          provide: ReleasesService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReleasesController>(ReleasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
