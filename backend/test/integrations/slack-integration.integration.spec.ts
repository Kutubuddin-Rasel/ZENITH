import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SlackIntegrationService } from '../../src/integrations/services/slack-integration.service';
import {
  Integration,
  IntegrationType,
} from '../../src/integrations/entities/integration.entity';
import { ExternalData } from '../../src/integrations/entities/external-data.entity';
import { SearchIndex } from '../../src/integrations/entities/search-index.entity';

describe('SlackIntegrationService (Integration)', () => {
  let service: SlackIntegrationService;

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
        SlackIntegrationService,
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

    service = module.get<SlackIntegrationService>(SlackIntegrationService);

    // Mock fetch globally
    global.fetch = jest.fn();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('syncChannels', () => {
    it('should sync channels with pagination', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.SLACK,
        authConfig: { accessToken: 'token' },
      } as unknown as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);

      // Mock Slack API response (2 pages)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              channels: [
                {
                  id: 'C1',
                  name: 'general',
                  is_private: false,
                  is_member: true,
                },
                {
                  id: 'C2',
                  name: 'random',
                  is_private: false,
                  is_member: true,
                },
              ],
              response_metadata: { next_cursor: 'next' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              channels: [
                { id: 'C3', name: 'dev', is_private: true, is_member: true },
              ],
              response_metadata: { next_cursor: '' }, // End of pagination
            }),
        });

      await service.syncChannels('1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockExternalDataRepo.save).toHaveBeenCalledTimes(3); // 3 channels
    });

    it('should handle API errors', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.SLACK,
        authConfig: { accessToken: 'token' },
      } as unknown as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: false,
            error: 'invalid_auth',
          }),
      });

      await expect(service.syncChannels('1')).rejects.toThrow(
        'Slack API error: invalid_auth',
      );
    });
  });

  describe('syncMessages', () => {
    it('should sync messages with pagination', async () => {
      const integration = {
        id: '1',
        type: IntegrationType.SLACK,
        authConfig: { accessToken: 'token' },
        lastSyncAt: new Date('2023-01-01'),
      } as unknown as Integration;

      mockIntegrationRepo.findOne.mockResolvedValue(integration);

      // Mock Slack API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            messages: [{ ts: '1234567890.000001', text: 'Hello', user: 'U1' }],
            response_metadata: { next_cursor: '' },
          }),
      });

      await service.syncMessages('1', 'C1');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockExternalDataRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
