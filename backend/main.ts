import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Log all incoming headers for debugging
  app.use((req, res, next) => {
    console.log('Incoming headers:', req.headers);
    next();
  });

  await app.listen(3000);
}
bootstrap(); 