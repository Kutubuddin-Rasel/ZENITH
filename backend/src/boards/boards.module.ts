// src/boards/boards.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { BoardColumn } from './entities/board-column.entity';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';

/**
 * Boards Module
 *
 * Provides Kanban board functionality with:
 * - Real-time updates via WebSocket (BoardGateway from global GatewaysModule)
 * - 5-second micro-cache on read endpoints to prevent "refresh storms"
 *
 * Cache Strategy:
 * - GET endpoints use CacheInterceptor with 5s TTL
 * - POST/PATCH/DELETE endpoints bypass cache
 * - No manual invalidation needed (TTL is short enough)
 *
 * NOTE: BoardGateway is injected via the @Global() GatewaysModule.
 * No explicit import needed here (arch-module-sharing pattern).
 */
@Module({
  imports: [
    // SOLID Refactor (Step 3): Board + Issue exposed via @Global DatabaseModule.
    // Only the non-Tier-1 BoardColumn entity remains local.
    TypeOrmModule.forFeature([BoardColumn]),
    CacheModule.register({
      ttl: 5000, // 5 seconds - prevents standup refresh storms
      max: 100, // Max cached items per endpoint
    }),
  ],
  providers: [BoardsService],
  controllers: [BoardsController],
  exports: [BoardsService],
})
export class BoardsModule {}
