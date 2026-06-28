// src/boards/boards.module.ts
import { Module, Provider } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';

import { CacheModule } from '../cache/cache.module';
import { CommonEventsModule } from '../common/submodules/events.module';
import { WorkflowsModule } from '../workflows/workflows.module';

import { BoardsController } from './boards.controller';
import {
  BOARD_COLUMN_COMMAND_TOKEN,
  BOARD_COMMAND_TOKEN,
  BOARD_ORDERING_COMMAND_TOKEN,
  BOARD_QUERY_TOKEN,
} from './constants/boards.tokens';
import { BoardSeedPort } from './ports/board-seed.port';
import { BoardAuthzService } from './services/board-authz.service';
import { BoardColumnCommandService } from './services/board-column-command.service';
import { BoardCommandService } from './services/board-command.service';
import { BoardOrderingService } from './services/board-ordering.service';
import { BoardQueryService } from './services/board-query.service';

/**
 * Boards Module
 *
 * Provides Kanban board functionality with:
 *   - Real-time updates via WebSocket (BoardGateway from global GatewaysModule)
 *   - 5-second micro-cache on read endpoints to prevent "refresh storms"
 *
 * Cache Strategy:
 *   - GET endpoints use CacheInterceptor with 5s TTL
 *   - POST/PATCH/DELETE endpoints bypass cache
 *   - No manual invalidation needed (TTL is short enough)
 *
 * NOTE: BoardGateway is injected via the @Global() GatewaysModule.
 * No explicit import needed here (arch-module-sharing pattern).
 *
 * SOLID Refactor end-state (Step 3 commit 9)
 * ------------------------------------------
 * The legacy `BoardsService` god class and its spec are deleted. The
 * module is now a clean CQRS surface:
 *
 *   - `BoardQueryService`          → bound to `BOARD_QUERY_TOKEN`
 *   - `BoardCommandService`        → bound to `BOARD_COMMAND_TOKEN`
 *                                    AND `BoardSeedPort` (useExisting)
 *   - `BoardColumnCommandService`  → bound to `BOARD_COLUMN_COMMAND_TOKEN`
 *   - `BoardOrderingService`       → bound to `BOARD_ORDERING_COMMAND_TOKEN`
 *   - `BoardAuthzService`          → shared role-check helper
 *
 * The outbound `BoardSeedPort` adapter (anchored on
 * `BoardCommandService extends BoardSeedPort`) is what closed the
 * legacy `BoardsModule ↔ ProjectTemplatesModule` `forwardRef` cycle:
 * project-templates consumes the port from this module's exports.
 *
 * Step 4 (sealed barrel) will lock down public reach by exporting
 * ONLY interfaces/tokens/enums/ports from `boards/index.ts` and
 * banning deep imports via `no-restricted-imports`.
 */
const TOKEN_PROVIDERS: Provider[] = [
  { provide: BOARD_QUERY_TOKEN, useExisting: BoardQueryService },
  { provide: BOARD_COMMAND_TOKEN, useExisting: BoardCommandService },
  {
    provide: BOARD_COLUMN_COMMAND_TOKEN,
    useExisting: BoardColumnCommandService,
  },
  { provide: BOARD_ORDERING_COMMAND_TOKEN, useExisting: BoardOrderingService },
  // BoardSeedPort is satisfied by `BoardCommandService` (which extends the
  // abstract port). One-way cycle break — the adapter lives inside boards,
  // so `ProjectTemplatesModule` consumes a plain `BoardsModule` import.
  { provide: BoardSeedPort, useExisting: BoardCommandService },
];

@Module({
  imports: [
    NestCacheModule.register({
      ttl: 5000, // 5 seconds - prevents standup refresh storms
      max: 100, // Max cached items per endpoint
    }),
    CacheModule,
    CommonEventsModule,
    // Consume `WorkflowLookupPort` (declared in
    // `boards/ports/workflow-lookup.port.ts`, bound by `WorkflowsModule`).
    // Replaces the pre-Step-2 `dataSource.getRepository(WorkflowStatus)`
    // leak inside the ordering service.
    WorkflowsModule,
  ],
  providers: [
    BoardAuthzService,
    BoardQueryService,
    BoardColumnCommandService,
    BoardCommandService,
    BoardOrderingService,
    ...TOKEN_PROVIDERS,
  ],
  controllers: [BoardsController],
  exports: [
    // ISP tokens — the only public surface external consumers depend on.
    BOARD_QUERY_TOKEN,
    BOARD_COMMAND_TOKEN,
    BOARD_COLUMN_COMMAND_TOKEN,
    BOARD_ORDERING_COMMAND_TOKEN,
    // Outbound port re-export so `project-templates` resolves the port
    // without depending on the concrete `BoardCommandService` class.
    BoardSeedPort,
  ],
})
export class BoardsModule {}
