import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GitHubIntegrationService,
  GitHubIssue,
  GitHubPullRequest,
  GitHubRepository,
  GitHubCommit,
} from './github-integration.service';
import {
  Integration,
  IntegrationType,
  IntegrationStatus,
} from '../entities/integration.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { RateLimitService } from './rate-limit.service';
import { TokenManagerService } from './token-manager.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { UsersService } from '../../users/users.service';
import { IssuesService } from '../../issues/issues.service';
import { GitHubIssueLinkService } from './github-issue-link.service';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GitHubIntegrationService', () => {
  let service: GitHubIntegrationService;
  let integrationRepo: jest.Mocked<Repository<Integration>>;
  let externalDataRepo: jest.Mocked<Repository<ExternalData>>;
  let searchIndexRepo: jest.Mocked<Repository<SearchIndex>>;
  let rateLimitService: jest.Mocked<RateLimitService>;
  let tokenManagerService: jest.Mocked<TokenManagerService>;
  let encryptionService: jest.Mocked<EncryptionService>;

  const mockIntegration: Integration = {
    id: 'test-integration-id',
    name: 'Test GitHub Integration',
    type: IntegrationType.GITHUB,
    config: {
      repositories: ['owner/repo'],
      syncSettings: { enabled: true, frequency: 'hourly', batchSize: 10 },
    },
    authConfig: {
      type: 'oauth',
      accessToken: 'encrypted-token',
    },
    organizationId: 'test-org-id',
    isActive: true,
    healthStatus: IntegrationStatus.HEALTHY,
    installationId: null,
    accountType: null,
    accountLogin: null,
    isLegacyOAuth: false,
    lastSyncAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    encryptedAccessToken: '',
    encryptedRefreshToken: '',
    syncLogs: [],
    externalData: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockGitHubRepo: GitHubRepository = {
    id: 123,
    name: 'repo',
    full_name: 'owner/repo',
    description: 'A test repository',
    private: false,
    html_url: 'https://github.com/owner/repo',
    clone_url: 'https://github.com/owner/repo.git',
    default_branch: 'main',
    owner: {
      login: 'owner',
      id: 1,
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
    },
    updated_at: new Date().toISOString(),
    stargazers_count: 100,
    language: 'TypeScript',
  };

  const mockGitHubIssue: GitHubIssue = {
    id: 456,
    number: 1,
    title: 'Test Issue',
    body: 'This is a test issue',
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    user: {
      login: 'testuser',
      id: 2,
      avatar_url: 'https://avatars.githubusercontent.com/u/2',
    },
    assignees: [],
    labels: [{ name: 'bug', color: 'd73a4a' }],
    milestone: null,
  };

  const mockGitHubPR: GitHubPullRequest = {
    id: 789,
    number: 2,
    title: 'Test PR',
    body: 'This is a test PR',
    html_url: 'https://github.com/owner/repo/pull/2',
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    merged_at: null,
    user: {
      login: 'testuser',
      id: 2,
      avatar_url: 'https://avatars.githubusercontent.com/u/2',
    },
    assignees: [],
    labels: [],
    head: { ref: 'feature-branch', sha: 'abc123' },
    base: { ref: 'main', sha: 'def456' },
    mergeable: true,
    mergeable_state: 'clean',
    merged_by: null,
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubIntegrationService,
        {
          provide: getRepositoryToken(Integration),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ExternalData),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SearchIndex),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: RateLimitService,
          useValue: {
            executeWithRetry: jest.fn((fn) => fn()),
          },
        },
        {
          provide: TokenManagerService,
          useValue: {
            executeWithTokenRefresh: jest.fn((id, fn) => fn('decrypted-token')),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            decrypt: jest.fn(() => 'decrypted-token'),
            encrypt: jest.fn(() => 'encrypted-token'),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findAll: jest.fn(() => [{ id: 'user-1' }]),
          },
        },
        {
          provide: IssuesService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: GitHubIssueLinkService,
          useValue: {
            handleCommitMagicWords: jest.fn(() => []),
            linkCommitToIssues: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GitHubIntegrationService>(GitHubIntegrationService);
    integrationRepo = module.get(getRepositoryToken(Integration));
    externalDataRepo = module.get(getRepositoryToken(ExternalData));
    searchIndexRepo = module.get(getRepositoryToken(SearchIndex));
    rateLimitService = module.get(RateLimitService);
    tokenManagerService = module.get(TokenManagerService);
    encryptionService = module.get(EncryptionService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('syncRepositories', () => {
    it('should sync repositories successfully', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      externalDataRepo.findOne.mockResolvedValue(null);
      externalDataRepo.create.mockReturnValue({} as ExternalData);
      externalDataRepo.save.mockResolvedValue({} as ExternalData);
      searchIndexRepo.findOne.mockResolvedValue(null);
      searchIndexRepo.create.mockReturnValue({} as SearchIndex);
      searchIndexRepo.save.mockResolvedValue({} as SearchIndex);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGitHubRepo,
      });

      const result = await service.syncRepositories('test-integration-id');

      expect(result).toHaveLength(1);
      expect(result[0].full_name).toBe('owner/repo');
      expect(tokenManagerService.executeWithTokenRefresh).toHaveBeenCalled();
    });

    it('should throw error when integration not found', async () => {
      integrationRepo.findOne.mockResolvedValue(null);

      await expect(service.syncRepositories('non-existent-id')).rejects.toThrow(
        'GitHub integration non-existent-id not found',
      );
    });
  });

  describe('syncIssues', () => {
    it('should sync issues with executeWithTokenAndRetry', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      integrationRepo.save.mockResolvedValue(mockIntegration);
      externalDataRepo.findOne.mockResolvedValue(null);
      externalDataRepo.create.mockReturnValue({} as ExternalData);
      externalDataRepo.save.mockResolvedValue({} as ExternalData);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockGitHubIssue],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [], // Empty page to end pagination
        });

      const result = await service.syncIssues(
        'test-integration-id',
        'owner/repo',
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Issue');
      // Verify executeWithTokenAndRetry was used (via tokenManagerService mock)
      expect(tokenManagerService.executeWithTokenRefresh).toHaveBeenCalled();
    });

    it('should filter out pull requests from issues', async () => {
      const issueWithPR = { ...mockGitHubIssue, pull_request: { url: '...' } };
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      integrationRepo.save.mockResolvedValue(mockIntegration);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockGitHubIssue, issueWithPR],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });

      const result = await service.syncIssues(
        'test-integration-id',
        'owner/repo',
      );

      // Only the actual issue should be returned, not the one with pull_request
      expect(result).toHaveLength(1);
    });

    it('should update lastSyncAt after sync', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      integrationRepo.save.mockResolvedValue(mockIntegration);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await service.syncIssues('test-integration-id', 'owner/repo');

      expect(integrationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSyncAt: expect.any(Date),
        }),
      );
    });
  });

  describe('syncPullRequests', () => {
    it('should sync pull requests successfully', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      externalDataRepo.findOne.mockResolvedValue(null);
      externalDataRepo.create.mockReturnValue({} as ExternalData);
      externalDataRepo.save.mockResolvedValue({} as ExternalData);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockGitHubPR],
      });

      const result = await service.syncPullRequests(
        'test-integration-id',
        'owner/repo',
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test PR');
    });
  });

  describe('registerRepositoryProjectLink', () => {
    it('should upsert repository-project link', async () => {
      externalDataRepo.upsert.mockResolvedValue(undefined as any);

      await service.registerRepositoryProjectLink(
        'test-integration-id',
        'owner/repo',
        'project-123',
        'PROJ',
      );

      expect(externalDataRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationId: 'test-integration-id',
          externalType: 'repo_project_link',
          externalId: 'owner/repo',
          rawData: expect.objectContaining({
            projectId: 'project-123',
            projectKey: 'PROJ',
          }),
        }),
        expect.any(Array),
      );
    });
  });

  describe('listUserRepositories', () => {
    it('should list all user repositories with pagination', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            full_name: 'owner/repo1',
            name: 'repo1',
            private: false,
            description: null,
          },
          {
            full_name: 'owner/repo2',
            name: 'repo2',
            private: true,
            description: 'A repo',
          },
        ],
      });

      const result = await service.listUserRepositories('test-integration-id');

      expect(result).toHaveLength(2);
      expect(result[0].full_name).toBe('owner/repo1');
      expect(result[1].full_name).toBe('owner/repo2');
    });
  });

  describe('mapExternalData', () => {
    it('should map repository data correctly', () => {
      // Access protected method via type assertion
      const mapFn = (service as any).mapExternalData.bind(service);

      const result = mapFn('repository', {
        full_name: 'owner/repo',
        description: 'Test repo',
        owner: { login: 'owner' },
        html_url: 'https://github.com/owner/repo',
        private: false,
        default_branch: 'main',
        language: 'TypeScript',
        stargazers_count: 100,
        forks_count: 10,
        open_issues_count: 5,
      });

      expect(result).toEqual({
        title: 'owner/repo',
        content: 'Test repo',
        author: 'owner',
        source: 'github',
        url: 'https://github.com/owner/repo',
        metadata: expect.objectContaining({
          private: false,
          defaultBranch: 'main',
          language: 'TypeScript',
          stars: 100,
        }),
      });
    });

    it('should map issue data correctly', () => {
      const mapFn = (service as any).mapExternalData.bind(service);

      const result = mapFn('issue', {
        number: 42,
        title: 'Bug fix',
        body: 'Fixing a bug',
        user: { login: 'contributor' },
        html_url: 'https://github.com/owner/repo/issues/42',
        state: 'open',
        labels: [{ name: 'bug' }],
        assignees: [{ login: 'dev' }],
        milestone: { title: 'v1.0' },
      });

      expect(result.title).toBe('#42: Bug fix');
      expect(result.author).toBe('contributor');
      expect(result.metadata.labels).toContain('bug');
    });

    it('should return null for unknown type', () => {
      const mapFn = (service as any).mapExternalData.bind(service);
      const result = mapFn('unknown_type', {});
      expect(result).toBeNull();
    });
  });

  describe('handleWebhook', () => {
    it('should handle push event with commits', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      externalDataRepo.findOne.mockResolvedValue(null);

      const payload = {
        action: 'push',
        repository: mockGitHubRepo,
        commits: [
          {
            id: 'abc123',
            message: 'Fixes #123',
            timestamp: new Date().toISOString(),
            url: 'https://github.com/owner/repo/commit/abc123',
            author: { name: 'Dev', email: 'dev@example.com' },
            committer: { name: 'Dev', email: 'dev@example.com' },
            added: [],
            removed: [],
            modified: ['file.ts'],
          },
        ],
        sender: { login: 'dev', id: 1, avatar_url: '' },
      };

      await service.handleWebhook(payload as any);

      // Should have looked up integration
      expect(integrationRepo.findOne).toHaveBeenCalled();
    });

    it('should handle issue opened event', async () => {
      integrationRepo.findOne.mockResolvedValue(mockIntegration);
      externalDataRepo.findOne.mockResolvedValue(null);
      externalDataRepo.create.mockReturnValue({} as ExternalData);
      externalDataRepo.save.mockResolvedValue({} as ExternalData);

      const payload = {
        action: 'opened',
        repository: mockGitHubRepo,
        issue: mockGitHubIssue,
        sender: { login: 'user', id: 1, avatar_url: '' },
      };

      await service.handleWebhook(payload as any);

      expect(externalDataRepo.save).toHaveBeenCalled();
    });
  });
});
