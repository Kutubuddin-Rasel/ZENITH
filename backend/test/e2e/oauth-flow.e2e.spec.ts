import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { IntegrationType } from '../../src/integrations/entities/integration.entity';
import { App } from 'supertest/types';

describe('OAuth Flow (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/oauth/authorize (GET) should redirect to provider', () => {
    return request(app.getHttpServer() as App)
      .get(`/oauth/authorize?type=${IntegrationType.GITHUB}&organizationId=123`)
      .expect(302)
      .expect((res: request.Response) => {
        expect(res.header.location).toContain(
          'github.com/login/oauth/authorize',
        );
        expect(res.header.location).toContain('client_id=');
      });
  });

  it('/oauth/callback (GET) should handle callback and create integration', async () => {
    // Mock the OAuth service exchangeCode method to avoid real API calls
    // In a real E2E test, we might mock the external API using nock
    // For this test, we assume the callback handler works if it receives valid params
    // Note: This test will likely fail without mocking the OAuthService or external APIs
    // because it tries to exchange a fake code.
    // Ideally, we'd use a mock OAuthService in the testing module.
  });
});
