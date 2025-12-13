import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { IntegrationType } from '../entities/integration.entity';

describe('OAuthService', () => {
  let service: OAuthService;

  const mockConfigService = {
    get: jest.fn((key: string): string | null => {
      const config: Record<string, string> = {
        GITHUB_CLIENT_ID: 'github-id',
        GITHUB_CLIENT_SECRET: 'github-secret',
        GITHUB_REDIRECT_URI:
          'http://localhost:3000/api/integrations/oauth/github/callback',
        SLACK_CLIENT_ID: 'slack-id',
        SLACK_CLIENT_SECRET: 'slack-secret',
        SLACK_REDIRECT_URI:
          'http://localhost:3000/api/integrations/oauth/slack/callback',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return config[key] ?? null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildAuthorizeUrl', () => {
    it('should generate correct GitHub URL', () => {
      const url = service.buildAuthorizeUrl(IntegrationType.GITHUB, 'state123');
      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=github-id');
      expect(url).toContain('state=state123');
    });

    it('should generate correct Slack URL', () => {
      const url = service.buildAuthorizeUrl(IntegrationType.SLACK, 'state123');
      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('client_id=slack-id');
      expect(url).toContain('state=state123');
    });

    it('should throw error for unsupported provider', () => {
      expect(() =>
        service.buildAuthorizeUrl('INVALID' as IntegrationType, 'state'),
      ).toThrow();
    });
  });

  describe('exchangeCodeForTokens', () => {
    // Mock fetch for token exchange tests
    global.fetch = jest.fn();

    it('should exchange code for token (GitHub)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: (): Promise<{ access_token: string; token_type: string }> =>
          Promise.resolve({
            access_token: 'gh-token',
            token_type: 'bearer',
          }),
      });

      const result = await service.exchangeCodeForTokens(
        IntegrationType.GITHUB,
        'code123',
      );

      expect(result).toEqual({
        access_token: 'gh-token',
        token_type: 'bearer',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.any(Object),
      );
    });

    it('should exchange code for token (Slack)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: (): Promise<{
          ok: boolean;
          authed_user: { access_token: string };
          access_token: string;
        }> =>
          Promise.resolve({
            ok: true,
            authed_user: { access_token: 'slack-token' },
            access_token: 'slack-token',
          }),
      });

      const result = await service.exchangeCodeForTokens(
        IntegrationType.SLACK,
        'code123',
      );

      expect(result).toHaveProperty('access_token');
    });
  });
});
