import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentHistory } from './entities/attachment-history.entity';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ReleasesService } from '../releases/releases.service';
import { SprintsService } from '../sprints/sprints.service';
import { CommentsService } from '../comments/comments.service';

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    remove: jest.fn(),
  };

  const mockIssuesService = { findOne: jest.fn() };
  const mockMembersService = { getUserRole: jest.fn() };
  const mockReleasesService = { findOne: jest.fn() };
  const mockSprintsService = { findOne: jest.fn() };
  const mockCommentsService = { update: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: getRepositoryToken(Attachment), useValue: mockRepo },
        { provide: getRepositoryToken(AttachmentHistory), useValue: mockRepo },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: ReleasesService, useValue: mockReleasesService },
        { provide: SprintsService, useValue: mockSprintsService },
        { provide: CommentsService, useValue: mockCommentsService },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
