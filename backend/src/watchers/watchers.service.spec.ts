import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WatchersService } from './watchers.service';
import { Watcher } from './entities/watcher.entity';
import { Project } from '../projects/entities/project.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { NotificationsEmitter } from './events/notifications.events';

describe('WatchersService', () => {
  let service: WatchersService;

  const mockRepo = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockMembersService = {
    getUserRole: jest.fn(),
  };

  const mockNotifications = {
    emitNotification: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchersService,
        { provide: getRepositoryToken(Watcher), useValue: mockRepo },
        { provide: getRepositoryToken(Project), useValue: mockRepo },
        { provide: getRepositoryToken(Issue), useValue: mockRepo },
        { provide: ProjectMembersService, useValue: mockMembersService },
        { provide: NotificationsEmitter, useValue: mockNotifications },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<WatchersService>(WatchersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
