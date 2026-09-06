import { Test, TestingModule } from '@nestjs/testing';
import { EMAIL_TEMPLATE_RENDERER_TOKEN } from '../constants/email.tokens';
import { EMAIL_JOB_NAMES, SendReportJobData } from '../interfaces/email.interfaces';
import { DownloadLinkPort } from '../ports/download-link.port';
import { ReportComposer } from './report.composer';

describe('ReportComposer', () => {
  let composer: ReportComposer;
  let renderer: { render: jest.Mock; available: jest.Mock };
  let downloadLink: { createDownloadUrl: jest.Mock };

  const jobData = (overrides: Partial<SendReportJobData> = {}) =>
    ({
      type: EMAIL_JOB_NAMES.SEND_REPORT,
      to: 'lead@example.com',
      projectName: 'Apollo',
      reportType: 'Velocity',
      s3ObjectKey: 'org-1/reports/velocity-2026-W32.pdf',
      expiresInHours: 48,
      ...overrides,
    }) as SendReportJobData;

  beforeEach(async () => {
    renderer = {
      render: jest.fn().mockReturnValue('<html>report</html>'),
      available: jest.fn().mockReturnValue(['report-ready']),
    };
    downloadLink = {
      createDownloadUrl: jest.fn().mockResolvedValue('https://s3/signed'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportComposer,
        { provide: EMAIL_TEMPLATE_RENDERER_TOKEN, useValue: renderer },
        { provide: DownloadLinkPort, useValue: downloadLink },
      ],
    }).compile();

    composer = module.get(ReportComposer);
  });

  // ==========================================================================
  // D2 REGRESSION — the "48 hours" lie.
  //
  // The old handler rendered `expiresInHours: 48` into the template while
  // calling `getDownloadUrl(key)` with no TTL, which signed for
  // AWS_S3_PRESIGNED_EXPIRATION (default 900s). Recipients were promised 48
  // hours and handed a link that died in 15 minutes.
  // ==========================================================================
  describe('presigned URL lifetime (D2 regression)', () => {
    it('signs the URL for exactly the advertised window', async () => {
      await composer.compose(jobData({ expiresInHours: 48 }));

      expect(downloadLink.createDownloadUrl).toHaveBeenCalledWith(
        'org-1/reports/velocity-2026-W32.pdf',
        48 * 3600,
      );
    });

    it('keeps the signature and the rendered copy derived from one value', async () => {
      await composer.compose(jobData({ expiresInHours: 6 }));

      const [, ttlSeconds] = downloadLink.createDownloadUrl.mock.calls[0] as [
        string,
        number,
      ];
      const context = renderer.render.mock.calls[0][1] as Record<
        string,
        unknown
      >;

      expect(ttlSeconds).toBe(6 * 3600);
      expect(context.expiresInHours).toBe('6');
      // The invariant that actually matters: copy and signature agree.
      expect(Number(context.expiresInHours) * 3600).toBe(ttlSeconds);
    });
  });

  describe('composition', () => {
    it('embeds the freshly minted URL, not the object key', async () => {
      await composer.compose(jobData());

      const context = renderer.render.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(renderer.render).toHaveBeenCalledWith(
        'report-ready',
        expect.any(Object),
      );
      expect(context.downloadUrl).toBe('https://s3/signed');
    });

    it('addresses the message to the recipient with a sanitised subject', async () => {
      const message = await composer.compose(
        jobData({ projectName: 'Barnes & Noble' }),
      );

      expect(message.to).toBe('lead@example.com');
      // Ampersands survive: a subject is plain text, never HTML.
      expect(message.subject).toContain('Barnes & Noble');
      expect(message.html).toBe('<html>report</html>');
    });
  });
});
