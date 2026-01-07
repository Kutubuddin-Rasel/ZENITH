import { Test, TestingModule } from '@nestjs/testing';
import { RevisionsController } from './revisions.controller';
import { RevisionsService } from './revisions.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

describe('RevisionsController', () => {
  let controller: RevisionsController;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    revert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RevisionsController],
      providers: [
        {
          provide: RevisionsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RevisionsController>(RevisionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
