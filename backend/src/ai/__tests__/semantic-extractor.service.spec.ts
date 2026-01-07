import { Test, TestingModule } from '@nestjs/testing';
import { SemanticExtractorService } from '../services/semantic-extractor.service';
import { AIProviderService } from '../services/ai-provider.service';
import {
  createEmptyCriteria,
  IntelligentCriteria,
  ConversationMessage,
} from '../interfaces/intelligent-criteria.interface';
import {
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';

describe('SemanticExtractorService', () => {
  let service: SemanticExtractorService;
  let mockAIProvider: jest.Mocked<Partial<AIProviderService>>;

  beforeEach(async () => {
    mockAIProvider = {
      isAvailable: false,
      complete: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticExtractorService,
        {
          provide: AIProviderService,
          useValue: mockAIProvider,
        },
      ],
    }).compile();

    service = module.get<SemanticExtractorService>(SemanticExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Keyword-based Extraction (Fallback)', () => {
    // Tests use fallback since AI is unavailable

    describe('Project Type Detection', () => {
      it('should detect mobile development', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'I need to build a mobile app for iOS and Android',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.projectType).toBe(
          ProjectCategory.MOBILE_DEVELOPMENT,
        );
      });

      it('should detect website development', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'We are creating a website with React',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.projectType).toBe(
          ProjectCategory.WEBSITE_DEVELOPMENT,
        );
      });

      it('should detect marketing campaigns', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'Planning a marketing campaign for our product launch',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.projectType).toBe(ProjectCategory.PRODUCT_LAUNCH);
      });
    });

    describe('Team Size Detection', () => {
      it('should detect solo work', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'I work solo on this project',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.teamSize).toBe('1');
      });

      it('should detect small team', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'We have a small team working on this',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.teamSize).toBe('2-5');
      });

      it('should detect medium team', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'We have a medium team for this project',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.teamSize).toBe('6-10');
      });
    });

    describe('Work Style Detection', () => {
      it('should detect Scrum preference', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'We want to use Scrum methodology',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.workStyle).toBe(ProjectMethodology.SCRUM);
      });

      it('should detect Kanban preference', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'We prefer Kanban workflow',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.workStyle).toBe(ProjectMethodology.KANBAN);
      });
    });

    describe('External Stakeholder Detection', () => {
      it('should detect client work', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'This is a project for a client',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.hasExternalStakeholders).toBe(true);
      });

      it('should detect agency work', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'Our agency is building this for a customer',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.hasExternalStakeholders).toBe(true);
      });
    });

    describe('Complex Extraction', () => {
      it('should extract multiple fields from a single message', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content:
              'Building a mobile app for a client with a small team. We prefer kanban.',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.criteria.projectType).toBe(
          ProjectCategory.MOBILE_DEVELOPMENT,
        );
        expect(result.criteria.hasExternalStakeholders).toBe(true);
        expect(result.criteria.teamSize).toBe('2-5');
        expect(result.criteria.workStyle).toBe(ProjectMethodology.KANBAN);
      });

      it('should track newly extracted fields', async () => {
        const messages: ConversationMessage[] = [
          {
            role: 'user',
            content: 'Website development project with 5 people',
            timestamp: new Date(),
          },
        ];
        const result = await service.extractFromConversation(
          messages,
          createEmptyCriteria(),
        );

        expect(result.newlyExtracted).toContain('projectType');
        expect(result.newlyExtracted).toContain('teamSize');
      });
    });
  });

  describe('Criteria Merging', () => {
    it('should preserve existing criteria when new extraction is null', async () => {
      const existingCriteria: Partial<IntelligentCriteria> = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.MOBILE_DEVELOPMENT,
        teamSize: '2-5',
      };

      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'We prefer working in sprints',
          timestamp: new Date(),
        },
      ];
      const result = await service.extractFromConversation(
        messages,
        existingCriteria,
      );

      // Should keep existing + add new
      expect(result.criteria.projectType).toBe(
        ProjectCategory.MOBILE_DEVELOPMENT,
      );
      expect(result.criteria.teamSize).toBe('2-5');
      expect(result.criteria.workStyle).toBe(ProjectMethodology.SCRUM);
    });
  });
});
