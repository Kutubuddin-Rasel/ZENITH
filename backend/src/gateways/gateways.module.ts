import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Board } from '../boards/entities/board.entity';
import { BoardGateway } from './board.gateway';
import { BoardAccessService } from './board-access.service';
import { WsSessionStore } from './ws-session.store';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsExceptionFilter } from './filters/ws-exception.filter';

// SOLID Refactor (issues Step 2b): capability-owner side of the issues →
// realtime inversion. The `IssueBroadcastPort` contract is issues-owned;
// binding the adapter in this @Global module lets issues fan board events out
// without injecting `BoardGateway`/`BoardRepository` directly.
import { IssueBroadcastPort } from '../issues';
import { IssueBroadcastAdapter } from './adapters/issue-broadcast.adapter';

import { CacheModule } from '../cache/cache.module';
/**
 * GatewaysModule
 *
 * Global module providing WebSocket infrastructure:
 * - BoardGateway: Real-time board updates (JWT-protected)
 * - BoardAccessService: Room-level authorization (IDOR prevention)
 * - WsSessionStore: Redis-backed room subscription tracking (reconnect recovery)
 * - WsExceptionFilter: Structured error responses for WS clients
 * - WsJwtGuard: Handshake-level JWT validation
 *
 * NOTE: BoardAccessService injects PROJECT_MEMBER_QUERY_TOKEN from the
 * global MembershipModule.
 * Board entity is registered here for BoardAccessService's repo injection.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Board]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    CacheModule,
  ],
  providers: [
    BoardGateway,
    BoardAccessService,
    WsSessionStore,
    WsJwtGuard,
    WsExceptionFilter,
    { provide: IssueBroadcastPort, useClass: IssueBroadcastAdapter },
  ],
  exports: [
    BoardGateway,
    BoardAccessService,
    WsSessionStore,
    IssueBroadcastPort,
  ],
})
export class GatewaysModule {}
