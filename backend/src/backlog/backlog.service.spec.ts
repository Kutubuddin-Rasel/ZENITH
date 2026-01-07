import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BacklogService } from './backlog.service';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';

describe('BacklogService', () => {
  let service: BacklogService;

  const mockRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockMembersService = {
    getUserRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacklogService,
        { provide: getRepositoryToken(Issue), useValue: mockRepo },
        { provide: ProjectMembersService, useValue: mockMembersService },
      ],
    }).compile();

    service = module.get<BacklogService>(BacklogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
