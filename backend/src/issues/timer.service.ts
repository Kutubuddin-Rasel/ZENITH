import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { WorkLogsService } from './issues.service';
import {
  ActiveTimerPayload,
  TimerStatus,
  buildTimerKey,
  TIMER_NAMESPACE,
  TIMER_TTL_SECONDS,
} from './dto/timer.interface';
import { WorkLog } from './entities/work-log.entity';

@Injectable()
export class TimerService {
  private readonly logger = new Logger(TimerService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly workLogsService: WorkLogsService,
  ) {}

  async start(
    userId: string,
    projectId: string,
    issueId: string,
  ): Promise<ActiveTimerPayload> {
    const key = buildTimerKey(userId);
    const existing = await this.cache.get<ActiveTimerPayload>(key, {
      namespace: TIMER_NAMESPACE,
    });
    if (existing) {
      throw new ConflictException(
        'Timer already running. Stop it before starting a new one.',
      );
    }
    const payload: ActiveTimerPayload = {
      userId,
      projectId,
      issueId,
      startedAt: new Date().toISOString(),
    };
    const ok = await this.cache.set(key, payload, {
      namespace: TIMER_NAMESPACE,
      ttl: TIMER_TTL_SECONDS,
    });
    if (!ok) {
      throw new InternalServerErrorException(
        'Failed to persist timer state in Redis',
      );
    }
    return payload;
  }

  async stop(
    userId: string,
    options: { note?: string; billable?: boolean; hourlyRate?: number },
  ): Promise<WorkLog> {
    const key = buildTimerKey(userId);
    const payload = await this.cache.get<ActiveTimerPayload>(key, {
      namespace: TIMER_NAMESPACE,
    });
    if (!payload) {
      throw new NotFoundException('No active timer found');
    }

    // ATOMIC BOUNDARY: delete first; only persist a WorkLog if Redis ACK'd the delete.
    const deleted = await this.cache.del(key, { namespace: TIMER_NAMESPACE });
    if (!deleted) {
      throw new ConflictException(
        'Timer could not be released; aborting work-log creation',
      );
    }

    const startedAt = new Date(payload.startedAt).getTime();
    const elapsedMs = Date.now() - startedAt;
    const minutesSpent = Math.max(1, Math.round(elapsedMs / 60000));

    try {
      return await this.workLogsService.addWorkLog(
        payload.projectId,
        payload.issueId,
        userId,
        minutesSpent,
        options.note,
        options.billable,
        options.hourlyRate,
      );
    } catch (err) {
      // Best-effort: restore timer so the user can retry rather than losing time.
      await this.cache.set(key, payload, {
        namespace: TIMER_NAMESPACE,
        ttl: TIMER_TTL_SECONDS,
      });
      this.logger.error(
        `Restored timer for user=${userId} after WorkLog persistence failure`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  async status(userId: string): Promise<TimerStatus | null> {
    const key = buildTimerKey(userId);
    const payload = await this.cache.get<ActiveTimerPayload>(key, {
      namespace: TIMER_NAMESPACE,
    });
    if (!payload) return null;
    const elapsedMs = Date.now() - new Date(payload.startedAt).getTime();
    return {
      userId: payload.userId,
      projectId: payload.projectId,
      issueId: payload.issueId,
      startedAt: payload.startedAt,
      elapsedMs,
      elapsedMinutes: Math.floor(elapsedMs / 60000),
    };
  }
}
