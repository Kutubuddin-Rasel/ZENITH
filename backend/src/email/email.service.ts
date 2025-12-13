import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Define the error type from Resend API
interface ResendError {
  message: string;
  name?: string;
}

// Define the response type from Resend API
interface ResendResponse {
  data: { id: string } | null;
  error: ResendError | null;
}

@Injectable()
export class EmailService {
  private resend: Resend | null = null;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY is not defined. Emails will be logged to console only.',
      );
    }
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
  }

  async sendInvitationEmail(
    to: string,
    inviteLink: string,
    inviterName: string,
    orgName: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[MOCK EMAIL] To: ${to}, Link: ${inviteLink}`);
      return;
    }

    try {
      const response = (await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `You've been invited to join ${orgName} on Zenith`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited!</h2>
            <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Zenith.</p>
            <p>Click the button below to accept the invitation:</p>
            <a href="${inviteLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
            <p style="margin-top: 24px; font-size: 14px; color: #666;">
              Or copy and paste this link into your browser:<br>
              <a href="${inviteLink}">${inviteLink}</a>
            </p>
          </div>
        `,
      })) as ResendResponse;

      const { data, error } = response;

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${error.message}`);
        // Fallback to console log in dev/testing if email fails
        if (process.env.NODE_ENV !== 'production') {
          this.logger.log(
            `[FALLBACK EMAIL LOG] To: ${to}, Link: ${inviteLink}`,
          );
        }
        throw new Error(error.message);
      }

      if (data) {
        this.logger.log(`Email sent to ${to}, ID: ${data.id}`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error sending email: ${error.message}`);
      // Fallback to console log in dev/testing if email fails
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[FALLBACK EMAIL LOG] To: ${to}, Link: ${inviteLink}`);
      }
    }
  }
}
