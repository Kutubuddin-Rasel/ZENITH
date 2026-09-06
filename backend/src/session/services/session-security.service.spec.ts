/* eslint-disable @typescript-eslint/unbound-method */
import { SessionSecurityService } from './session-security.service';
import { SessionStatus } from '../entities/session.entity';
import type { Session } from '../entities/session.entity';
import type {
  ISessionAuditor,
  ISessionConfig,
  ISessionStore,
} from '../interfaces/session.interfaces';

/**
 * Regression coverage for BUG #2: `lockSession` must record the owning userId
 * in the audit trail. The legacy implementation resolved the userId via an
 * ACTIVE-only lookup AFTER flipping the status to SUSPENDED, so the audit
 * userId always came back undefined. The userId is now resolved (status-
 * agnostic) BEFORE the status change.
 */
describe('SessionSecurityService — bug #2 (lock audit userId)', () => {
  let store: jest.Mocked<ISessionStore>;
  let config: ISessionConfig;
  let auditor: jest.Mocked<ISessionAuditor>;
  let service: SessionSecurityService;

  beforeEach(() => {
    store = {
      findById: jest.fn(),
      updateBySessionId: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ISessionStore>;
    config = {
      maxConcurrentSessions: 5,
      sessionTimeoutMinutes: 30,
      rememberMeDays: 30,
    };
    auditor = {
      sessionLocked: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ISessionAuditor>;
    service = new SessionSecurityService(store, config, auditor);
  });

  it('audits the lock with the real owning userId, resolved before the status change', async () => {
    store.findById.mockResolvedValue({
      sessionId: 'sess-1',
      userId: 'owner-42',
    } as unknown as Session);

    await service.lockSession('sess-1', 'admin-9', 'suspicious');

    // userId resolved via the status-agnostic lookup, BEFORE the update.
    expect(store.findById).toHaveBeenCalledWith('sess-1');
    expect(store.findById.mock.invocationCallOrder[0]).toBeLessThan(
      store.updateBySessionId.mock.invocationCallOrder[0],
    );
    expect(store.updateBySessionId).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ status: SessionStatus.SUSPENDED }),
    );
    expect(auditor.sessionLocked).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      userId: 'owner-42',
      lockedBy: 'admin-9',
      reason: 'suspicious',
    });
  });
});
