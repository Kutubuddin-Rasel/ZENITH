import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheConfig } from '../config/cache.config';

/**
 * CacheTtlService - Centralized Cache TTL Provider
 *
 * Provides consistent cache TTL values from configuration.
 * Use this service instead of hardcoding TTL values.
 *
 * TTL Tiers (all in seconds):
 * - micro: 5s - Real-time data that can tolerate tiny staleness (board states)
 * - short: 60s - Frequently changing data
 * - medium: 300s (5 min) - Moderately stable data
 * - long: 900s (15 min) - Stable data with occasional updates
 * - extended: 3600s (1 hour) - Rarely changing data
 * - daily: 86400s (24 hours) - Static or slow-changing reference data
 */
@Injectable()
export class CacheTtlService {
  private readonly ttl: {
    micro: number;
    short: number;
    medium: number;
    long: number;
    extended: number;
    daily: number;
  };

  constructor(private readonly configService: ConfigService) {
    const cacheConfig = this.configService.get<CacheConfig>('cache');

    // Load from config with sensible defaults
    this.ttl = {
      micro: cacheConfig?.ttl.micro ?? 5,
      short: cacheConfig?.ttl.short ?? 60,
      medium: cacheConfig?.ttl.medium ?? 300,
      long: cacheConfig?.ttl.long ?? 900,
      extended: cacheConfig?.ttl.extended ?? 3600,
      daily: cacheConfig?.ttl.daily ?? 86400,
    };
  }

  /**
   * Micro TTL - 5 seconds default
   * Use for: Real-time data, board states, highly dynamic content
   */
  get micro(): number {
    return this.ttl.micro;
  }

  /**
   * Short TTL - 60 seconds default
   * Use for: frequently changing data, notifications count
   */
  get short(): number {
    return this.ttl.short;
  }

  /**
   * Medium TTL - 5 minutes default
   * Use for: reports, analytics, session data
   */
  get medium(): number {
    return this.ttl.medium;
  }

  /**
   * Long TTL - 15 minutes default
   * Use for: issue details, project metadata
   */
  get long(): number {
    return this.ttl.long;
  }

  /**
   * Extended TTL - 1 hour default
   * Use for: user preferences, organization settings
   */
  get extended(): number {
    return this.ttl.extended;
  }

  /**
   * Daily TTL - 24 hours default
   * Use for: static data, user profiles, rarely changing reference data
   */
  get daily(): number {
    return this.ttl.daily;
  }

  /**
   * Get all TTL values as an object (for debugging/logging)
   */
  getAll(): Record<string, number> {
    return { ...this.ttl };
  }
}
