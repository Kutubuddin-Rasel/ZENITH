import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ClsService],
      useFactory: (cls: ClsService) => ({
        pinoHttp: {
          // JSON in production, pretty in development
          transport:
            process.env.NODE_ENV !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,

          // Auto-attach CLS context to every log line
          mixin: () => ({
            requestId: cls.get('requestId'),
            organizationId: cls.get('organizationId'),
          }),

          // CRITICAL: Redaction rules for PCI-DSS/GDPR compliance
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.currentPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.body.accessToken',
              'req.body.apiKey',
              'req.body.secret',
              'req.body.creditCard',
              'req.body.cvv',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },

          // Log level based on response status
          customLogLevel: (
            _req: unknown,
            res: { statusCode: number },
            err: unknown,
          ) => {
            if (res.statusCode >= 500 || err) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },

          // Minimal request serialization
          serializers: {
            req: (req: { method: string; url: string; query: unknown }) => ({
              method: req.method,
              url: req.url,
              query: req.query,
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
