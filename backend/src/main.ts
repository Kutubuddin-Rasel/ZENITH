import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  Logger,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { HTTPSConfigService } from './encryption/config/https.config';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import * as https from 'https';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security headers - Strict CSP for API-only backend
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"], // API shouldn't serve HTML
          scriptSrc: ["'none'"], // No scripts from backend
          styleSrc: ["'none'"], // No styles from backend
          imgSrc: ["'none'"], // No images from backend
          connectSrc: ["'self'"], // Allow API calls to self
          fontSrc: ["'none'"], // No fonts from backend
          objectSrc: ["'none'"], // No plugins
          mediaSrc: ["'none'"], // No media
          frameSrc: ["'none'"], // No iframes
          formAction: ["'none'"], // No form submissions
          frameAncestors: ["'none'"], // Cannot be embedded
          baseUri: ["'none'"], // Prevent base hijacking
        },
      },
      crossOriginEmbedderPolicy: false, // Allow CORS
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow frontend access
    }),
  );

  // Compression - eslint exception for compression library type
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const compressionMiddleware = compression();

  app.use(compressionMiddleware as Parameters<typeof app.use>[0]);

  // Cookie Parser
  app.use(cookieParser());

  // CORS configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 86400, // 24 hours
  });

  // Raw body parser for webhook signature verification
  // This preserves the raw request body needed for HMAC verification
  app.use(
    (
      req: Request & { rawBody?: Buffer },
      res: Response,
      next: NextFunction,
    ) => {
      // Only capture raw body for webhook endpoints
      if (req.path.includes('/webhook')) {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          data += chunk;
        });
        req.on('end', () => {
          req.rawBody = Buffer.from(data, 'utf8');
          next();
        });
      } else {
        next();
      }
    },
  );

  // Global validation pipe
  // Enable Raw Body for Stripe Webhooks
  app.use('/billing/webhook', bodyParser.raw({ type: 'application/json' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global serialization interceptor
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || 'unknown';
    logger.log(`${req.method} ${req.url} - ${requestId}`);
    next();
  });

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Zenith API')
    .setDescription('Project Management for Modern Software Teams')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // HTTPS configuration
  const httpsConfigService = new HTTPSConfigService(configService);
  const httpsConfig = httpsConfigService.getHTTPSConfig();

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  if (httpsConfig) {
    // Start HTTPS server
    const server = https.createServer(
      httpsConfig,
      app.getHttpAdapter().getInstance() as Parameters<
        typeof https.createServer
      >[1],
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
