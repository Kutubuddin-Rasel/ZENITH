import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GitHubIntegrationService } from '../../src/integrations/services/github-integration.service';
import {
  Integration,
  IntegrationType,
} from '../../src/integrations/entities/integration.entity';
import { ExternalData } from '../../src/integrations/entities/external-data.entity';
import { SearchIndex } from '../../src/integrations/entities/search-index.entity';

describe('GitHubIntegrationService (Integration)', () => {
  let service: GitHubIntegrationService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockExternalDataRepo = {
    findOne: jest.fn(),
    create: jest
      .fn()
      .mockImplementation(
        (dto: Partial<ExternalData>): Partial<ExternalData> => dto,
      ),
    save: jest.fn(),
  };

  const mockSearchIndexRepo = {
    findOne: jest.fn(),
    create: jest
      .fn()
      .mockImplementation(
        (dto: Partial<SearchIndex>): Partial<SearchIndex> => dto,
      ),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubIntegrationService,
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepo,
        },
        {
          provide: getRepositoryToken(ExternalData),
          useValue: mockExternalDataRepo,
        },
        {
          provide: getRepositoryToken(SearchIndex),
          useValue: mockSearchIndexRepo,
        },
      ],
    }).compile();

    service = module.get<GitHubIntegrationService>(GitHubIntegrationService);

    // Mock fetch globally
    global.fetch = jest.fn();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncRepositories', () => {
    it('should sync repositories with pagination', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: { accessToken: 'token' },
        config: { repositories: [] },
      } as unknown as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);

      // Mock GitHub API response (2 pages)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, full_name: 'org/repo1', owner: { login: 'org' } },
              { id: 2, full_name: 'org/repo2', owner: { login: 'org' } },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]), // End of pagination
        });

      await service.syncRepositories('1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockExternalDataRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.GITHUB,
        authConfig: { accessToken: 'token' },
      } as unknown as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(service.syncRepositories('1')).rejects.toThrow();
    });
  });
});
