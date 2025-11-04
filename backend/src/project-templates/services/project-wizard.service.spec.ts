import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectWizardService } from './project-wizard.service';
import { ProjectTemplate } from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import { ProjectsService } from '../../projects/projects.service';

describe('ProjectWizardService', () => {
  let service: ProjectWizardService;
  let mockTemplateRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let mockPreferencesRepo: {
    findOne: jest.Mock;
  };
  let mockProjectsService: {
    create: jest.Mock;
  };

  beforeEach(async () => {
    mockTemplateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockPreferencesRepo = {
      findOne: jest.fn(),
    };

    mockProjectsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectWizardService,
        {
          provide: getRepositoryToken(ProjectTemplate),
          useValue: mockTemplateRepo,
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: mockPreferencesRepo,
        },
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
      ],
    }).compile();

    service = module.get<ProjectWizardService>(ProjectWizardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWizardQuestions', () => {
    it('should return wizard questions for a user', async () => {
      const userId = 'test-user-id';
      const questions = await service.getWizardQuestions(userId);

      expect(questions).toBeDefined();
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);

      // Check that questions have required properties
      questions.forEach((question) => {
        expect(question).toHaveProperty('id');
        expect(question).toHaveProperty('question');
        expect(question).toHaveProperty('type');
        expect(question).toHaveProperty('required');
        expect(question).toHaveProperty('order');
        expect(question).toHaveProperty('category');
      });
    });
  });

  describe('processWizardResponses', () => {
    it('should process wizard responses and return recommendations', async () => {
      const userId = 'test-user-id';
      const responses = [
        {
          questionId: 'project_name',
          answer: 'Test Project',
          timestamp: new Date(),
        },
        {
          questionId: 'team_size',
          answer: '2-5',
          timestamp: new Date(),
        },
        {
          questionId: 'industry',
          answer: 'software_development',
          timestamp: new Date(),
        },
      ];

      // Mock template repository
      mockTemplateRepo.find.mockResolvedValue([
        {
          id: 'template-1',
          name: 'Software Development Template',
          category: 'software_development',
          methodology: 'agile',
          usageCount: 10,
          templateConfig: {
            defaultSprintDuration: 14,
            defaultIssueTypes: ['Bug', 'Task', 'Story'],
            suggestedRoles: [
              { role: 'Developer', description: 'Builds the product' },
            ],
          },
        },
      ]);

      // Mock preferences repository
      mockPreferencesRepo.findOne.mockResolvedValue(null);

      const result = await service.processWizardResponses(userId, responses);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('suggestedConfig');
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});
