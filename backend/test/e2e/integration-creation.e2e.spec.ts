import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { IntegrationType } from '../../src/integrations/entities/integration.entity';
import { App } from 'supertest/types';

interface IntegrationResponse {
  id: string;
  name: string;
  type: IntegrationType;
  authConfig?: {
    accessToken?: string;
  };
}

describe('Integration Creation Flow (E2E)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Mock authentication if needed, or use a test user
    // For now, we'll assume we can get a token or bypass auth for testing
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await app.close();
  });

  it('/integrations (POST) should create a new integration', () => {
    // This test assumes we have a valid organization ID and auth token
    // In a real scenario, we'd create an org first
    const organizationId = '123';

    return request(app.getHttpServer() as App)
      .post('/integrations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test GitHub Integration',
        type: IntegrationType.GITHUB,
        organizationId,
        config: {
          repositories: ['org/repo'],
        },
        authConfig: {
          accessToken: 'gh_token_123',
        },
      })
      .expect(201)
      .expect((res: request.Response) => {
        const body = res.body as IntegrationResponse;
        expect(body).toHaveProperty('id');
        expect(body.name).toBe('Test GitHub Integration');
        expect(body.type).toBe(IntegrationType.GITHUB);
        // Ensure sensitive data is not returned or is encrypted
        expect(body.authConfig?.accessToken).toBeUndefined();
      });
  });

  it('/integrations/:id (GET) should return the created integration', async () => {
    // First create one
    const organizationId = '123';
    const createRes = await request(app.getHttpServer() as App)
      .post('/integrations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Slack Integration',
        type: IntegrationType.SLACK,
        organizationId,
        config: {},
        authConfig: { accessToken: 'slack_token' },
      });

    const integrationId = (createRes.body as IntegrationResponse).id;

    return request(app.getHttpServer() as App)
      .get(`/integrations/${integrationId}?organizationId=${organizationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect((res: request.Response) => {
        const body = res.body as IntegrationResponse;
        expect(body.id).toBe(integrationId);
        expect(body.name).toBe('Test Slack Integration');
      });
  });
});
