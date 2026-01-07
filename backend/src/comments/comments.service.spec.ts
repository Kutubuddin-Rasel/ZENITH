import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { WatchersService } from '../watchers/watchers.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepo: any;
  let issuesService: any;
  let membersService: any;
  let watchersService: any;

  const mockComment = {
    id: 'comment-123',
    content: 'Test comment',
    issueId: 'issue-123',
    authorId: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const createMockRepository = () => ({
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
    });

    const mockIssuesService = {
      findOne: jest.fn(),
    };

    const mockMembersService = {
      getUserRole: jest.fn(),
    };

    const mockWatchersService = {
      notifyWatchersOnEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: getRepositoryToken(Comment),
          useValue: createMockRepository(),
        },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: WatchersService, useValue: mockWatchersService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    commentRepo = module.get(getRepositoryToken(Comment));
    issuesService = module.get(IssuesService);
    membersService = module.get(ProjectMembersService);
    watchersService = module.get(WatchersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a comment', async () => {
      const dto = { content: 'New comment' };
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      commentRepo.create.mockReturnValue(mockComment);
      commentRepo.save.mockResolvedValue(mockComment);

      const result = await service.create(
        'project-123',
        'issue-123',
        'user-123',
        dto,
      );

      expect(result).toEqual(mockComment);
      expect(issuesService.findOne).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        'user-123',
      );
      expect(commentRepo.save).toHaveBeenCalled();
      expect(watchersService.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        'commented',
        'user-123',
      );
    });

    it('should throw if issue access denied', async () => {
      issuesService.findOne.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create(
          'project-123',
          'issue-123',
          'user-123',
          { content: 'test' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return comments for an issue', async () => {
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      commentRepo.find.mockResolvedValue([mockComment]);

      const result = await service.findAll(
        'project-123',
        'issue-123',
        'user-123',
      );

      expect(result).toEqual([mockComment]);
      expect(commentRepo.find).toHaveBeenCalledWith({
        where: { issueId: 'issue-123' },
        relations: ['author'],
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('update', () => {
    it('should update comment if user is author', async () => {
      const dto = { content: 'Updated content' };
      commentRepo.findOneBy.mockResolvedValue(mockComment);
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      membersService.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);
      commentRepo.save.mockResolvedValue({ ...mockComment, ...dto });

      const result = await service.update(
        'project-123',
        'issue-123',
        'comment-123',
        'user-123', // Same as author
        dto,
      );

      expect(result.content).toBe('Updated content');
      expect(watchersService.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        'edited a comment',
        'user-123',
      );
    });

    it('should update comment if user is project lead', async () => {
      commentRepo.findOneBy.mockResolvedValue(mockComment);
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      membersService.getUserRole.mockResolvedValue(ProjectRole.PROJECT_LEAD);
      commentRepo.save.mockResolvedValue(mockComment);

      await service.update(
        'project-123',
        'issue-123',
        'comment-123',
        'admin-user', // Different user
        { content: 'Moderated' },
      );

      expect(commentRepo.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not author nor lead', async () => {
      commentRepo.findOneBy.mockResolvedValue(mockComment);
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      membersService.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await expect(
        service.update(
          'project-123',
          'issue-123',
          'comment-123',
          'other-user',
          { content: 'Hacked' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if comment not found', async () => {
      commentRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.update(
          'project-123',
          'issue-123',
          'comment-123',
          'user-123',
          { content: 'test' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove comment if user is author', async () => {
      commentRepo.findOneBy.mockResolvedValue(mockComment);
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      membersService.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await service.remove(
        'project-123',
        'issue-123',
        'comment-123',
        'user-123',
      );

      expect(commentRepo.remove).toHaveBeenCalledWith(mockComment);
      expect(watchersService.notifyWatchersOnEvent).toHaveBeenCalledWith(
        'project-123',
        'issue-123',
        'deleted a comment',
        'user-123',
      );
    });

    it('should throw ForbiddenException if user is not author nor lead', async () => {
      commentRepo.findOneBy.mockResolvedValue(mockComment);
      issuesService.findOne.mockResolvedValue({ id: 'issue-123' });
      membersService.getUserRole.mockResolvedValue(ProjectRole.DEVELOPER);

      await expect(
        service.remove(
          'project-123',
          'issue-123',
          'comment-123',
          'other-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if comment not found', async () => {
      commentRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.remove(
          'project-123',
          'issue-123',
          'comment-123',
          'user-123',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
