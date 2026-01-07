import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import helmet from 'helmet';
import shrinkRay from 'shrink-ray-current';
import * as cookieParser from 'cookie-parser';
import { HTTPSConfigService } from './encryption/config/https.config';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as https from 'https';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as bodyParser from 'body-parser';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // Buffer logs until Pino is ready
  });

  // Use Pino logger globally
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const configService = app.get(ConfigService);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // WebSocket Redis Adapter for horizontal scaling
  const redisAdapter = new RedisIoAdapter(app, configService);
  try {
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);
    logger.log('WebSocket adapter: Redis (horizontal scaling enabled)');
  } catch (error) {
    logger.warn('Redis WebSocket adapter failed, using default:', error);
  }

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

  // Brotli + Gzip Compression
  // shrink-ray-current provides Brotli (15-20% smaller than Gzip) with Gzip fallback
  // for clients that don't support Brotli. This significantly reduces API response sizes.
  app.use(shrinkRay() as Parameters<typeof app.use>[0]);

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

  // IMPORTANT: Order matters! Webhook-specific parsers MUST come FIRST
  // These capture rawBody for signature verification
  app.use(
    '/api/integrations/github-app/webhook',
    bodyParser.json({
      verify: (
        req: Request & { rawBody?: Buffer },
        _res: Response,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(
    '/api/integrations/github/webhook',
    bodyParser.json({
      verify: (
        req: Request & { rawBody?: Buffer },
        _res: Response,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(
    '/api/integrations/slack/webhook',
    bodyParser.json({
      verify: (
        req: Request & { rawBody?: Buffer },
        _res: Response,
        buf: Buffer,
      ) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use('/billing/webhook', bodyParser.raw({ type: 'application/json' }));

  // Global JSON body parser for all OTHER routes (after webhook-specific ones)
  // Express middleware chain: first matching path wins
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Global validation pipe

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

  // Static file serving for uploads (avatars, etc.)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
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
