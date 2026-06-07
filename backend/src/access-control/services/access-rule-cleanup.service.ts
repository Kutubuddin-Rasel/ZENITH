import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as cron from 'node-cron';
import { AccessRuleStatus } from '../entities/ip-access-rule.entity';
import { AccessRuleRepository } from '../repositories/abstract/access-rule.repository';
import {
  ACCESS_CONTROL_EVENTS,
  RulesChangedEvent,
} from '../constants/access-control.events';

@Injectable()
export class AccessRuleCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessRuleCleanupService.name);
  private task?: cron.ScheduledTask;

  constructor(
    private readonly accessRuleRepo: AccessRuleRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.task = cron.schedule('0 * * * *', () => {
      void this.cleanupExpiredRules();
    });
  }

  onModuleDestroy(): void {
    void this.task?.stop();
  }

  private async cleanupExpiredRules(): Promise<void> {
    const now = new Date();
    const expiredRules = await this.accessRuleRepo.findExpiredBefore(now);

    for (const rule of expiredRules) {
      await this.accessRuleRepo.update(rule.id, {
        status: AccessRuleStatus.EXPIRED,
        isActive: false,
      });

      this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
        ruleId: rule.id,
        organizationId: rule.organizationId,
        action: 'expired-cleanup',
      } as RulesChangedEvent);
    }

    if (expiredRules.length > 0) {
      this.logger.log(`Cleaned up ${expiredRules.length} expired access rules`);
    }
  }
}
