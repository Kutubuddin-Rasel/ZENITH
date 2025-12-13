import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables from .env file
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'zenith',
  entities: [join(__dirname, '/../../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/../../database/migrations/*{.ts,.js}')],
  synchronize: false, // Always false for migrations
  logging: process.env.DB_LOGGING === 'true',
});
