import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS for frontend dev server
  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use((req, res, next) => {
    console.log('Incoming headers:', req.headers);
    next();
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
