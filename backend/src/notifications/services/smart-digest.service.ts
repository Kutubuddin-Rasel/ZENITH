import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { NotificationType } from '../entities/notification.entity';
import { NotificationsService } from '../notifications.service';

export interface StagedNotification {
    message: string;
    context: { projectId?: string;[key: string]: any };
    type: NotificationType;
    createdAt: Date;
}

@Injectable()
export class SmartDigestService {
    private readonly logger = new Logger(SmartDigestService.name);
    private readonly STAGING_TTL = 86400; // 24 hours

    constructor(
        private readonly cacheService: CacheService,
        @Inject(forwardRef(() => NotificationsService))
        private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * Stage a notification for later digest delivery.
     */
    async stageNotification(
        userId: string,
        item: StagedNotification,
    ): Promise<void> {
        const key = `notifications:staging:${userId}`;
        await this.cacheService.rpush(key, item, { ttl: this.STAGING_TTL });
    }

    /**
     * Check if user has pending notifications.
     */
    async hasPending(userId: string): Promise<boolean> {
        const key = `notifications:staging:${userId}`;
        const len = await this.cacheService.llen(key);
        return len > 0;
    }

    /**
     * Process and flush pending notifications for a user into a single Digest.
     */
    async processDigest(userId: string): Promise<void> {
        const key = `notifications:staging:${userId}`;
        const items = await this.cacheService.lrange<StagedNotification>(
            key,
            0,
            -1,
        );

        if (!items || items.length === 0) return;

        // Group by Project (assuming context.projectId exists)
        const byProject: Record<string, number> = {};
        let otherCount = 0;

        for (const item of items) {
            if (item.context && item.context.projectId) {
                const pid = item.context.projectId; // In real app, name would be better
                byProject[pid] = (byProject[pid] || 0) + 1;
            } else {
                otherCount++;
            }
        }

        // Synthesize Message
        const projectSummaries = Object.entries(byProject).map(
            ([pid, count]) => `${count} updates in project ${pid.substring(0, 8)}`,
        );
        let summary = 'Smart Digest: ';
        if (projectSummaries.length > 0) {
            summary += projectSummaries.join(', ');
            if (otherCount > 0) summary += ` and ${otherCount} other updates.`;
        } else {
            summary += `${items.length} new updates available.`;
        }

        // Create Digest Notification
        await this.notificationsService.createMany(
            [userId],
            summary,
            { type: 'digest', count: items.length },
            NotificationType.INFO,
        );

        // Clear Staging
        await this.cacheService.del(key);
        this.logger.log(
            `Generated digest for user ${userId} with ${items.length} items`,
        );
    }
}
