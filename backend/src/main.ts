import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { HTTPSConfigService } from './encryption/config/https.config';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Compression
  app.use(compression());

  // CORS configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 86400, // 24 hours
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Request logging
  app.use((req: any, res: any, next: any) => {
    const requestId =
      ((req.headers as Record<string, unknown>)['x-request-id'] as string) ||
      'unknown';
    logger.log(`${req.method as string} ${req.url as string} - ${requestId}`);
    next();
  });

  // HTTPS configuration
  const httpsConfigService = new HTTPSConfigService(configService);
  const httpsConfig = httpsConfigService.getHTTPSConfig();

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';

  if (httpsConfig) {
    // Start HTTPS server
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const https = require('https');
    const server = https.createServer(
      httpsConfig,
      app.getHttpAdapter().getInstance(),
    );

    server.listen(port, host, () => {
      logger.log(`🚀 Application is running on: https://${host}:${port}`);
      logger.log(`🔒 HTTPS enabled with SSL certificates`);
    });
  } else {
    // Start HTTP server (development only)
    logger.warn(
      '⚠️  HTTPS not configured, running in HTTP mode (not recommended for production)',
    );
    await app.listen(port, host);
    logger.log(`🚀 Application is running on: http://${host}:${port}`);
  }
}
void bootstrap();
