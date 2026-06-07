import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CACHE_HEALTH_TOKEN } from './cache/constants/cache.tokens';

describe('AppController', () => {
  let appController: AppController;

  const mockDataSource = {
    query: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: CACHE_HEALTH_TOKEN,
          useValue: {
            ping: jest.fn().mockResolvedValue('PONG'),
            isHealthy: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
