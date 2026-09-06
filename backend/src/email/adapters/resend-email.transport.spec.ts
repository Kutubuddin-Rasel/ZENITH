import { ConfigService } from '@nestjs/config';
import { ResendEmailTransport } from './resend-email.transport';
import { OutboundEmail } from '../interfaces/email.interfaces';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

/**
 * These assertions were impossible before this refactor: the Resend client was
 * constructed inside `EmailProcessor`, so testing delivery meant instantiating
 * a BullMQ worker and reaching the network.
 */
describe('ResendEmailTransport', () => {
  const message: OutboundEmail = {
    to: 'user@example.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
  };

  const configWith = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string) => values[key],
    }) as unknown as ConfigService;

  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('mock mode (no RESEND_API_KEY)', () => {
    // The only local-dev path — every developer without a Resend key relies on
    // it, so it is behaviour, not a convenience.
    const transport = () =>
      new ResendEmailTransport(configWith({ RESEND_API_KEY: undefined }));

    it('does not call the provider', async () => {
      await transport().deliver(message);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns a mock receipt naming the real recipient', async () => {
      const receipt = await transport().deliver(message);

      expect(receipt.messageId).toMatch(/^mock-/);
      expect(receipt.recipient).toBe('user@example.com');
      expect(Date.parse(receipt.sentAt)).not.toBeNaN();
    });
  });

  describe('live mode', () => {
    const transport = () =>
      new ResendEmailTransport(
        configWith({
          RESEND_API_KEY: 're_test_key',
          EMAIL_FROM: 'zenith@example.com',
        }),
      );

    it('forwards the composed message and returns the provider id', async () => {
      mockSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

      const receipt = await transport().deliver(message);

      expect(mockSend).toHaveBeenCalledWith({
        from: 'zenith@example.com',
        to: ['user@example.com'],
        subject: 'Hello',
        html: '<p>Hi</p>',
      });
      expect(receipt.messageId).toBe('msg_123');
    });

    it('falls back to the default sender when EMAIL_FROM is unset', async () => {
      mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

      await new ResendEmailTransport(
        configWith({ RESEND_API_KEY: 're_test_key' }),
      ).deliver(message);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'onboarding@resend.dev' }),
      );
    });

    it('THROWS on a provider error so BullMQ retries', async () => {
      // Critical: swallowing this would convert a retryable failure into a
      // silently lost email.
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'rate limited' },
      });

      await expect(transport().deliver(message)).rejects.toThrow(
        'Resend API error: rate limited',
      );
    });

    it('tolerates a success response with no id', async () => {
      mockSend.mockResolvedValue({ data: null, error: null });

      const receipt = await transport().deliver(message);
      expect(receipt.messageId).toBe('unknown');
    });
  });
});
