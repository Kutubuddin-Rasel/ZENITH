// src/boards/boards.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { Issue } from '../issues/entities/issue.entity';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { BoardsGateway } from './boards.gateway';

/**
 * Boards Module
 *
 * Provides Kanban board functionality with:
 * - Real-time updates via WebSocket (BoardsGateway)
 * - 5-second micro-cache on read endpoints to prevent "refresh storms"
 *
 * Cache Strategy:
 * - GET endpoints use CacheInterceptor with 5s TTL
 * - POST/PATCH/DELETE endpoints bypass cache
 * - No manual invalidation needed (TTL is short enough)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Board, BoardColumn, Issue]),
    CacheModule.register({
      ttl: 5000, // 5 seconds - prevents standup refresh storms
      max: 100, // Max cached items per endpoint
    }),
  ],
  providers: [BoardsService, BoardsGateway],
  controllers: [BoardsController],
  exports: [BoardsService],
})
export class BoardsModule { }

