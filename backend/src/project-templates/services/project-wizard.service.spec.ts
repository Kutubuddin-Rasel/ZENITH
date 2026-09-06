import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectWizardService } from './project-wizard.service';
import { ProjectTemplate } from '../entities/project-template.entity';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import { PROJECT_COMMAND_TOKEN, PROJECT_QUERY_TOKEN } from '../../projects';
import { BoardSeedPort } from '../../boards';
import { SPRINT_COMMAND_TOKEN } from '../../sprints';
import { DataSource } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

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
  let mockProjectCommand: { create: jest.Mock };
  let mockProjectQuery: { findByKey: jest.Mock };

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

    mockProjectCommand = { create: jest.fn() };
    mockProjectQuery = { findByKey: jest.fn().mockResolvedValue(null) };

    const mockBoardSeed = { seed: jest.fn() };
    const mockSprintsService = { create: jest.fn() };
    const mockDataSource = { transaction: jest.fn() };
    const mockProjectRepo = { findOne: jest.fn() };

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
          provide: PROJECT_QUERY_TOKEN,
          useValue: mockProjectQuery,
        },
        {
          provide: PROJECT_COMMAND_TOKEN,
          useValue: mockProjectCommand,
        },
        {
          provide: BoardSeedPort,
          useValue: mockBoardSeed,
        },
        {
          provide: SPRINT_COMMAND_TOKEN,
          useValue: mockSprintsService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(Project), // Import Project entity needed
          useValue: mockProjectRepo,
        },
      ],
    }).compile();

    service = module.get<ProjectWizardService>(ProjectWizardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWizardQuestions', () => {
    it('should return wizard questions for a user', () => {
      const questions = service.getWizardQuestions();

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
