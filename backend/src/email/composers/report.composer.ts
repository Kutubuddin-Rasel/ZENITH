// src/email/composers/report.composer.ts
import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATE_RENDERER_TOKEN } from '../constants/email.tokens';
import {
  IEmailComposer,
  IEmailTemplateRenderer,
  OutboundEmail,
  SendReportJobData,
} from '../interfaces/email.interfaces';
import { DownloadLinkPort } from '../ports/download-link.port';
import { sanitizeSubject } from '../utils/subject-line.util';

const SECONDS_PER_HOUR = 3600;

/**
 * Scheduled-report distribution email.
 *
 * ⏱️ THE PRESIGNED URL IS MINTED HERE, AT CONSUME TIME — not at enqueue time.
 * If the queue is backed up, the recipient still gets the full advertised
 * window measured from delivery rather than from scheduling.
 *
 * 🐛 FIXES THE 48-HOUR LIE. The previous handler rendered
 * "valid for {{expiresInHours}} hours" (48) while calling
 * `s3.getDownloadUrl(key)` — a signature with no TTL, which signed for
 * `AWS_S3_PRESIGNED_EXPIRATION` (default 900 s). Readers were promised 48 hours
 * and handed a link that died in 15 minutes.
 *
 * `ttlSeconds` below is now the SINGLE source for both the signature and the
 * copy, so the two cannot disagree. `DownloadLinkPort.createDownloadUrl` takes
 * the TTL as a required argument specifically so this cannot regress silently.
 */
@Injectable()
export class ReportComposer implements IEmailComposer<SendReportJobData> {
  constructor(
    @Inject(EMAIL_TEMPLATE_RENDERER_TOKEN)
    private readonly renderer: IEmailTemplateRenderer,
    private readonly downloadLink: DownloadLinkPort,
  ) {}

  async compose(data: SendReportJobData): Promise<OutboundEmail> {
    const ttlSeconds = data.expiresInHours * SECONDS_PER_HOUR;

    // The S3 URL is ours, not user-supplied — it is deliberately NOT run
    // through the outbound link allowlist, which exists to vet links whose
    // host derives from configuration or user input.
    const downloadUrl = await this.downloadLink.createDownloadUrl(
      data.s3ObjectKey,
      ttlSeconds,
    );

    const html = this.renderer.render('report-ready', {
      title: `Weekly ${data.reportType} Report — ${data.projectName}`,
      projectName: data.projectName,
      reportType: data.reportType,
      downloadUrl,
      expiresInHours: String(data.expiresInHours),
      generatedAt: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    return {
      to: data.to,
      subject: sanitizeSubject(
        `📊 Weekly ${data.reportType} Report — ${data.projectName}`,
      ),
      html,
    };
  }
}
