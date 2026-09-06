/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { ICacheStore } from '../../../cache/interfaces/cache.interfaces';
import { RedisCsrfTokenRepository } from '../repositories/redis/redis-csrf-token.repository';

/**
 * Lock the `csrf:<userId>` key schema invariant. If this regresses,
 * existing tokens in production Redis become orphaned on deploy and
 * every active session bounces to 403 on its next state-changing
 * request.
 */
describe('RedisCsrfTokenRepository', () => {
  let repo: RedisCsrfTokenRepository;
  const store: jest.Mocked<ICacheStore> = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCsrfTokenRepository,
        { provide: CACHE_STORE_TOKEN, useValue: store },
      ],
    }).compile();
    repo = module.get(RedisCsrfTokenRepository);
  });

  it('builds the canonical csrf:<userId> key on get', async () => {
    store.get.mockResolvedValue('stored');
    await repo.get('user-42');
    expect(store.get).toHaveBeenCalledWith('csrf:user-42');
  });

  it('writes with TTL options on set', async () => {
    await repo.set('user-42', 'tok-abc', 600);
    expect(store.set).toHaveBeenCalledWith('csrf:user-42', 'tok-abc', {
      ttl: 600,
    });
  });

  it('deletes via the same canonical key', async () => {
    await repo.delete('user-42');
    expect(store.del).toHaveBeenCalledWith('csrf:user-42');
  });
});
