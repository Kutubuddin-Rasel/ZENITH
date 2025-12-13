import { Test, TestingModule } from '@nestjs/testing';
import { TemplateScorerService } from '../services/template-scorer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';
import {
  createEmptyCriteria,
  IntelligentCriteria,
} from '../interfaces/intelligent-criteria.interface';

describe('TemplateScorerService', () => {
  let service: TemplateScorerService;

  const mockTemplates: Partial<ProjectTemplate>[] = [
    {
      id: 'template-1',
      name: 'Scrum Software Template',
      category: ProjectCategory.SOFTWARE_DEVELOPMENT,
      methodology: ProjectMethodology.SCRUM,
      tags: ['technology', 'software'],
      usageCount: 100,
    },
    {
      id: 'template-2',
      name: 'Kanban Mobile Template',
      category: ProjectCategory.MOBILE_DEVELOPMENT,
      methodology: ProjectMethodology.KANBAN,
      tags: ['technology', 'mobile'],
      usageCount: 50,
    },
    {
      id: 'template-3',
      name: 'Marketing Campaign Template',
      category: ProjectCategory.MARKETING,
      methodology: ProjectMethodology.KANBAN,
      tags: ['marketing', 'advertising'],
      usageCount: 75,
    },
  ];

  const mockRepository = {
    find: jest.fn().mockResolvedValue(mockTemplates),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateScorerService,
        {
          provide: getRepositoryToken(ProjectTemplate),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TemplateScorerService>(TemplateScorerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Template Scoring', () => {
    it('should score templates based on criteria', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.MOBILE_DEVELOPMENT,
        teamSize: '2-5',
        workStyle: ProjectMethodology.KANBAN,
      };

      const results = await service.scoreTemplates(criteria);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      // Mobile + Kanban template should score highest
      expect(results[0].templateId).toBe('template-2');
    });

    it('should include scoring breakdown', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.SOFTWARE_DEVELOPMENT,
        teamSize: '6-10',
        workStyle: ProjectMethodology.SCRUM,
      };

      const results = await service.scoreTemplates(criteria);

      expect(results[0].breakdown).toBeDefined();
      expect(results[0].breakdown.categoryMatch).toBeDefined();
      expect(results[0].breakdown.methodologyMatch).toBeDefined();
    });

    it('should give higher category match for exact match', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.MARKETING,
        teamSize: '2-5',
        workStyle: ProjectMethodology.KANBAN,
      };

      const results = await service.scoreTemplates(criteria);

      // Marketing template should have highest category match
      const marketingTemplate = results.find(
        (r) => r.templateId === 'template-3',
      );
      expect(marketingTemplate?.breakdown.categoryMatch).toBe(1);
    });

    it('should give higher methodology match for exact match', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.SOFTWARE_DEVELOPMENT,
        workStyle: ProjectMethodology.SCRUM,
      };

      const results = await service.scoreTemplates(criteria);

      const scrumTemplate = results.find((r) => r.templateId === 'template-1');
      expect(scrumTemplate?.breakdown.methodologyMatch).toBe(1);
    });
  });

  describe('Result Ordering', () => {
    it('should return templates sorted by score descending', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.MOBILE_DEVELOPMENT,
        teamSize: '2-5',
        workStyle: ProjectMethodology.KANBAN,
      };

      const results = await service.scoreTemplates(criteria);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should include reasons for each recommendation', async () => {
      const criteria: IntelligentCriteria = {
        ...createEmptyCriteria(),
        projectType: ProjectCategory.MOBILE_DEVELOPMENT,
      };

      const results = await service.scoreTemplates(criteria);

      expect(results[0].reasons).toBeDefined();
      expect(Array.isArray(results[0].reasons)).toBe(true);
    });
  });
});
