import { Test, TestingModule } from '@nestjs/testing';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { CacheService } from '../../cache/cache.service';
import {
  createEmptyCriteria,
  createEmptyConfidence,
} from '../interfaces/intelligent-criteria.interface';

describe('ConversationManagerService', () => {
  let service: ConversationManagerService;
  let mockCacheService: jest.Mocked<Partial<CacheService>>;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    cacheStore = new Map();

    mockCacheService = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(cacheStore.get(key) || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve(true);
      }),
      del: jest.fn().mockImplementation((key: string) => {
        cacheStore.delete(key);
        return Promise.resolve(true);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationManagerService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<ConversationManagerService>(
      ConversationManagerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Context Creation', () => {
    it('should create new context with UUID', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      expect(context).toBeDefined();
      expect(context.id).toBeDefined();
      expect(context.userId).toBe('user-123');
      expect(context.messages).toEqual([]);
      expect(context.turnCount).toBe(0);
    });

    it('should save context to Redis on creation', async () => {
      await service.getOrCreateContext(undefined, 'user-123');

      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should retrieve existing context by ID', async () => {
      // Create a context first
      const created = await service.getOrCreateContext(undefined, 'user-123');

      // Now retrieve it
      const retrieved = await service.getOrCreateContext(
        created.id,
        'user-123',
      );

      expect(retrieved.id).toBe(created.id);
    });

    it('should create new context if user ID mismatch', async () => {
      const context1 = await service.getOrCreateContext(undefined, 'user-123');

      // Try to access with different user
      const context2 = await service.getOrCreateContext(
        context1.id,
        'user-456',
      );

      expect(context2.id).not.toBe(context1.id);
    });
  });

  describe('Message Management', () => {
    it('should add user message to context', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      service.addUserMessage(context, 'Hello, I need a project');

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe('user');
      expect(context.messages[0].content).toBe('Hello, I need a project');
    });

    it('should add assistant message to context', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      service.addAssistantMessage(context, 'What type of project?');

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe('assistant');
      expect(context.messages[0].content).toBe('What type of project?');
    });

    it('should increment turn count on user message', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      expect(context.turnCount).toBe(0);

      service.addUserMessage(context, 'Message 1');
      expect(context.turnCount).toBe(1);

      service.addUserMessage(context, 'Message 2');
      expect(context.turnCount).toBe(2);
    });

    it('should not increment turn count on assistant message', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      service.addAssistantMessage(context, 'Response');

      expect(context.turnCount).toBe(0);
    });
  });

  describe('Criteria Management', () => {
    it('should update criteria in context', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      service.updateCriteria(
        context,
        {
          projectType: 'mobile_development' as Parameters<
            typeof service.updateCriteria
          >[1]['projectType'],
          teamSize: '2-5' as Parameters<
            typeof service.updateCriteria
          >[1]['teamSize'],
        },
        createEmptyConfidence(),
      );

      expect(context.criteria.projectType).toBe('mobile_development');
      expect(context.criteria.teamSize).toBe('2-5');
    });
  });

  describe('Question Tracking', () => {
    it('should mark question as asked', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      expect(context.askedQuestions).toEqual([]);

      service.markQuestionAsked(context, 'projectType');

      expect(context.askedQuestions).toContain('projectType');
    });

    it('should not duplicate asked questions', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      service.markQuestionAsked(context, 'projectType');
      service.markQuestionAsked(context, 'projectType');

      expect(
        context.askedQuestions.filter((q) => q === 'projectType'),
      ).toHaveLength(1);
    });

    it('should check if question was asked', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      expect(service.wasQuestionAsked(context, 'projectType')).toBe(false);

      service.markQuestionAsked(context, 'projectType');

      expect(service.wasQuestionAsked(context, 'projectType')).toBe(true);
    });
  });

  describe('Missing Criteria Detection', () => {
    it('should detect all missing required criteria', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      const missing = service.getMissingCriteria(context.criteria);

      expect(missing).toContain('projectType');
      expect(missing).toContain('teamSize');
      expect(missing).toContain('workStyle');
    });

    it('should return empty array when all criteria present', () => {
      const criteria = createEmptyCriteria();
      criteria.projectType =
        'website_development' as typeof criteria.projectType;
      criteria.teamSize = '2-5';
      criteria.workStyle = 'scrum' as typeof criteria.workStyle;

      const missing = service.getMissingCriteria(criteria);

      expect(missing).toEqual([]);
    });

    it('should correctly identify partially filled criteria', () => {
      const criteria = createEmptyCriteria();
      criteria.projectType =
        'website_development' as typeof criteria.projectType;
      // teamSize and workStyle still missing

      const missing = service.getMissingCriteria(criteria);

      expect(missing).not.toContain('projectType');
      expect(missing).toContain('teamSize');
      expect(missing).toContain('workStyle');
    });
  });

  describe('Context Persistence', () => {
    it('should save context to Redis', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');
      service.addUserMessage(context, 'Test message');

      const saved = await service.saveContext(context);

      expect(saved).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should delete context from Redis', async () => {
      const context = await service.getOrCreateContext(undefined, 'user-123');

      await service.deleteContext(context.id);

      expect(mockCacheService.del).toHaveBeenCalled();
    });
  });
});
