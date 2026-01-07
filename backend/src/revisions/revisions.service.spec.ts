import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RevisionsService } from './revisions.service';
import { Revision } from './entities/revision.entity';
import { DiffService } from './services/diff.service';

describe('RevisionsService', () => {
  let service: RevisionsService;

  const mockRepo = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    manager: { getRepository: jest.fn() },
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    })),
  };

  const mockDiffService = {
    computeDiff: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevisionsService,
        { provide: getRepositoryToken(Revision), useValue: mockRepo },
        { provide: DiffService, useValue: mockDiffService },
      ],
    }).compile();

    service = module.get<RevisionsService>(RevisionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
