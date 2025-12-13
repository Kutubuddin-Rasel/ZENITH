import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIProviderService } from '../services/ai-provider.service';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';

describe('AIProviderService', () => {
  let service: AIProviderService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined), // No API keys configured
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIProviderService,
        OpenRouterProvider,
        GeminiProvider,
        GroqProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AIProviderService>(AIProviderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Availability', () => {
    it('should report unavailable when no API keys configured', () => {
      service.onModuleInit();
      expect(service.isAvailable).toBe(false);
    });

    it('should have empty available providers list when no keys', () => {
      service.onModuleInit();
      expect(service.availableProviders).toEqual([]);
    });
  });

  describe('Complete', () => {
    it('should return null when no providers available', async () => {
      service.onModuleInit();
      const result = await service.complete({
        messages: [{ role: 'user', content: 'test' }],
      });
      expect(result).toBeNull();
    });
  });

  describe('Health Check', () => {
    it('should return false for all providers when no keys configured', async () => {
      const health = await service.healthCheck();
      expect(health.OpenRouter).toBe(false);
      expect(health.Gemini).toBe(false);
    });
  });

  describe('Status', () => {
    it('should return proper status structure', () => {
      service.onModuleInit();
      const status = service.getStatus();
      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('providers');
      expect(Array.isArray(status.providers)).toBe(true);
    });
  });
});
