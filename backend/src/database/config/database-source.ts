import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables from .env file in backend root
dotenv.config({ path: join(__dirname, '../../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASS || 'password',
  database: process.env.DATABASE_NAME || 'zenith',
  entities: [join(__dirname, '/../../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/../../database/migrations/*{.ts,.js}')],
  synchronize: false, // Always false for migrations
  logging: process.env.DB_LOGGING === 'true',
});
