import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, ClickHouseClient as Client } from '@clickhouse/client';

@Injectable()
export class ClickHouseClient implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private isConnected = false;

  async onModuleInit() {
    try {
      this.client = createClient({
        url: process.env.CLICKHOUSE_HOST || 'http://localhost:8123', // Allow env config
        database: process.env.CLICKHOUSE_DB || 'audit_logs',
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        request_timeout: 5000,
      });

      // Test connection
      await this.client.ping();
      this.isConnected = true;
    } catch (error: unknown) {
      console.warn(
        'ClickHouse connection failed, audit logs will be disabled:',
        error instanceof Error ? error.message : String(error),
      );
      this.isConnected = false;
      return;
    }

    // Ensure table exists
    if (this.isConnected) {
      try {
        await this.client.command({
          query: `
        CREATE TABLE IF NOT EXISTS audit_logs (
          event_uuid UUID,
          timestamp DateTime64(3),
          tenant_id UUID,
          actor_id UUID,
          actor_ip String,
          resource_type LowCardinality(String),
          resource_id UUID,
          action_type LowCardinality(String),
          changes Map(String, String), -- Simplified for ClickHouse Map
          metadata String
        ) ENGINE = MergeTree()
        ORDER BY (tenant_id, timestamp)
        PARTITION BY toYYYYMM(timestamp)
      `,
        });
      } catch (error: unknown) {
        console.warn(
          'Failed to create ClickHouse table:',
          error instanceof Error ? error.message : String(error),
        );
        this.isConnected = false;
      }
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.client.close();
    }
  }

  async insert(entry: any) {
    if (!this.isConnected) return;
    try {
      await this.client.insert({
        table: 'audit_logs',
        values: [entry],
        format: 'JSONEachRow',
      });
    } catch (e) {
      console.error('Failed to insert audit log:', e);
    }
  }

  async insertBatch(entries: any[]) {
    if (!this.isConnected) return;
    try {
      await this.client.insert({
        table: 'audit_logs',
        values: entries,
        format: 'JSONEachRow',
      });
    } catch (e) {
      console.error('Failed to insert audit logs:', e);
    }
  }
}
