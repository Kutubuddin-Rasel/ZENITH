/* eslint-disable @typescript-eslint/unbound-method */
import { SessionLifecycleService } from './session-lifecycle.service';
import type { Session } from '../entities/session.entity';
import type {
  ISessionAuditor,
  ISessionSecurity,
  ISessionStore,
} from '../interfaces/session.interfaces';

/**
 * Regression coverage for BUG #1: `terminateAllUserSessions(userId, exceptId)`
 * must EXCLUDE the current session. The legacy implementation built a
 * Mongo-style `{ $ne }` filter that TypeORM silently ignored, so
 * `exceptCurrent` never protected the caller's own session. The exclusion now
 * lives in `ISessionStore.findActiveByUser(userId, exceptSessionId)`.
 */
describe('SessionLifecycleService — bug #1 (exceptCurrent)', () => {
  const session = (sessionId: string): Session =>
    ({
      sessionId,
      userId: 'user-1',
      createdAt: new Date(),
    }) as unknown as Session;

  let store: jest.Mocked<ISessionStore>;
  let security: jest.Mocked<ISessionSecurity>;
  let auditor: jest.Mocked<ISessionAuditor>;
  let service: SessionLifecycleService;

  beforeEach(() => {
    store = {
      findActiveByUser: jest.fn(),
      findActiveById: jest.fn(),
      updateBySessionId: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ISessionStore>;
    security = {
      updateConcurrentSessionCount: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ISessionSecurity>;
    auditor = {
      sessionTerminated: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ISessionAuditor>;
    service = new SessionLifecycleService(store, security, auditor);
  });

  it('forwards exceptSessionId to the store so the current session is excluded', async () => {
    // store already excludes "keep-me"; it only returns the others.
    store.findActiveByUser.mockResolvedValue([
      session('other-a'),
      session('other-b'),
    ]);
    // terminateSession re-fetches each returned session as active.
    store.findActiveById.mockImplementation((id: string) =>
      Promise.resolve(session(id)),
    );

    const count = await service.terminateAllUserSessions(
      'user-1',
      'keep-me',
      'user-1',
      'logout-others',
    );

    expect(store.findActiveByUser).toHaveBeenCalledWith('user-1', 'keep-me');
    expect(count).toBe(2);
    // The excluded session is never terminated.
    const terminatedIds = store.updateBySessionId.mock.calls.map(([id]) => id);
    expect(terminatedIds).toEqual(['other-a', 'other-b']);
    expect(terminatedIds).not.toContain('keep-me');
  });
});
