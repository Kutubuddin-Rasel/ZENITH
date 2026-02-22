import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

/**
 * Grace period (in seconds) before room subscriptions expire.
 * User has this window to reconnect and auto-rejoin rooms.
 * After expiration, rooms are forgotten and must be re-joined manually.
 */
const GRACE_PERIOD_TTL = 300; // 5 minutes

/** Redis namespace for all WS session keys */
const WS_SESSION_NAMESPACE = 'ws-sessions';

/**
 * WsSessionStore
 *
 * Redis-backed storage for WebSocket room subscriptions.
 * Enables connection state recovery: when a user reconnects
 * (page refresh, temporary disconnect), their previous room
 * subscriptions are restored automatically.
 *
 * DATA MODEL:
 *   Key:   ws:rooms:{userId}
 *   Value: ["board:uuid-1", "board:uuid-2"]
 *   TTL:   300s (5-minute grace period, refreshed on every trackRoom call)
 *
 * DESIGN:
 * - Per-user (not per-socket) — survives socket ID changes on reconnect
 * - Uses CacheService (global) — no direct Redis exposure
 * - Graceful degradation — if Redis is down, returns empty arrays
 */
@Injectable()
export class WsSessionStore {
  private readonly logger = new Logger(WsSessionStore.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Track a room subscription for a user.
   * Adds the room to the user's stored set and refreshes the TTL.
   *
   * @param userId - Authenticated user ID
   * @param roomName - Room name (e.g., "board:uuid-1")
   */
  async trackRoom(userId: string, roomName: string): Promise<void> {
    const key = this.buildKey(userId);
    const rooms = await this.getRooms(userId);

    // Avoid duplicates
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }

    // Store with rolling TTL (refreshed on every join)
    await this.cacheService.set(key, rooms, {
      ttl: GRACE_PERIOD_TTL,
      namespace: WS_SESSION_NAMESPACE,
    });

    this.logger.debug(
      `Tracked room ${roomName} for user ${userId} (total: ${rooms.length})`,
    );
  }

  /**
   * Remove a room subscription for a user.
   *
   * @param userId - Authenticated user ID
   * @param roomName - Room name to remove
   */
  async untrackRoom(userId: string, roomName: string): Promise<void> {
    const key = this.buildKey(userId);
    const rooms = await this.getRooms(userId);

    const filtered = rooms.filter((r) => r !== roomName);

    if (filtered.length === 0) {
      // No rooms left — clean up the key
      await this.cacheService.del(key, { namespace: WS_SESSION_NAMESPACE });
    } else {
      await this.cacheService.set(key, filtered, {
        ttl: GRACE_PERIOD_TTL,
        namespace: WS_SESSION_NAMESPACE,
      });
    }

    this.logger.debug(
      `Untracked room ${roomName} for user ${userId} (remaining: ${filtered.length})`,
    );
  }

  /**
   * Get all tracked rooms for a user.
   * Returns empty array if Redis is down or no rooms stored.
   *
   * @param userId - Authenticated user ID
   * @returns Array of room names
   */
  async getRooms(userId: string): Promise<string[]> {
    const key = this.buildKey(userId);
    const rooms = await this.cacheService.get<string[]>(key, {
      namespace: WS_SESSION_NAMESPACE,
    });

    return rooms ?? [];
  }

  /**
   * Clear all tracked rooms for a user.
   * Called when user explicitly logs out or sessions are revoked.
   *
   * @param userId - Authenticated user ID
   */
  async clearRooms(userId: string): Promise<void> {
    const key = this.buildKey(userId);
    await this.cacheService.del(key, { namespace: WS_SESSION_NAMESPACE });
    this.logger.debug(`Cleared all rooms for user ${userId}`);
  }

  /**
   * Build the Redis key for a user's room subscriptions.
   * Format: ws:rooms:{userId}
   */
  private buildKey(userId: string): string {
    return `ws:rooms:${userId}`;
  }
}
