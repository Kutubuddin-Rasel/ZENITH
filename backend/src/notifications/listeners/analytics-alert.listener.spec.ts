import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsAlertListener } from './analytics-alert.listener';
import { NOTIFICATION_ROUTER_TOKEN } from '../constants/notifications.tokens';
import { NotificationType } from '../entities/notification.entity';
import type { AnalyticsStallAlertEvent } from '../../analytics';

interface MockRouter {
  createMany: jest.Mock;
}

describe('AnalyticsAlertListener', () => {
  let listener: AnalyticsAlertListener;
  let router: MockRouter;

  const payload: AnalyticsStallAlertEvent = {
    userIds: ['u1'],
    message: 'You have 2 stalled issue(s)',
    context: { type: 'stall_alert', issueIds: ['i1', 'i2'] },
  };

  beforeEach(async () => {
    const mockRouter: MockRouter = {
      createMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAlertListener,
        { provide: NOTIFICATION_ROUTER_TOKEN, useValue: mockRouter },
      ],
    }).compile();

    listener = module.get(AnalyticsAlertListener);
    router = module.get(NOTIFICATION_ROUTER_TOKEN);
  });

  it('routes the stall alert to createMany with a WARNING type', async () => {
    await listener.handleStallAlert(payload);

    expect(router.createMany).toHaveBeenCalledWith(
      ['u1'],
      payload.message,
      payload.context,
      NotificationType.WARNING,
    );
  });

  it('swallows router failures (never throws into the emit loop)', async () => {
    router.createMany.mockRejectedValue(new Error('db down'));
    await expect(listener.handleStallAlert(payload)).resolves.toBeUndefined();
  });
});
