import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectMembersService } from './project-members.service';
import { ProjectMember } from '../entities/project-member.entity';

describe('ProjectMembersService', () => {
  let service: ProjectMembersService;

  const mockRepo = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMembersService,
        { provide: getRepositoryToken(ProjectMember), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ProjectMembersService>(ProjectMembersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
