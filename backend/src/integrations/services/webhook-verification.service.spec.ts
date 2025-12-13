import { Test, TestingModule } from '@nestjs/testing';
import { WebhookVerificationService } from './webhook-verification.service';
import * as crypto from 'crypto';

describe('WebhookVerificationService', () => {
  let service: WebhookVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookVerificationService],
    }).compile();

    service = module.get<WebhookVerificationService>(
      WebhookVerificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyGitHubSignature', () => {
    const secret = 'github-secret';

    it('should verify valid GitHub signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')}`;

      const isValid = service.verifyGitHubSignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid GitHub signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signature = 'sha256=invalid';

      const isValid = service.verifyGitHubSignature(payload, signature, secret);

      expect(isValid).toBe(false);
    });
  });

  describe('verifySlackSignature', () => {
    const signingSecret = 'slack-secret';

    it('should verify valid Slack signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ test: 'data' });
      const base = `v0:${timestamp}:${body}`;
      const signature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(base)
        .digest('hex')}`;

      const isValid = service.verifySlackSignature(
        body,
        timestamp,
        signature,
        signingSecret,
      );

      expect(isValid).toBe(true);
    });

    it('should reject old Slack requests (replay attack)', () => {
      const timestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 mins ago
      const body = JSON.stringify({ test: 'data' });
      const base = `v0:${timestamp}:${body}`;
      const signature = `v0=${crypto
        .createHmac('sha256', signingSecret)
        .update(base)
        .digest('hex')}`;

      const isValid = service.verifySlackSignature(
        body,
        timestamp,
        signature,
        signingSecret,
      );

      expect(isValid).toBe(false);
    });
  });
});
