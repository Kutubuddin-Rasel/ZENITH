import { Test, TestingModule } from '@nestjs/testing';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

describe('TaxonomyController', () => {
  let controller: TaxonomyController;

  const mockService = {
    createCategory: jest.fn(),
    createTag: jest.fn(),
    findAllCategories: jest.fn(),
    searchTags: jest.fn(),
    getCategoryHierarchy: jest.fn(),
    deleteCategory: jest.fn(),
    deleteTag: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxonomyController],
      providers: [
        {
          provide: TaxonomyService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TaxonomyController>(TaxonomyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
