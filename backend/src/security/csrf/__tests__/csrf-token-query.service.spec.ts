import { Test, TestingModule } from '@nestjs/testing';
import { HASHER_TOKEN } from '../../../encryption';
import { CSRF_TOKEN_REPOSITORY_TOKEN } from '../constants/csrf.tokens';
import { CsrfTokenQueryService } from '../services/csrf-token-query.service';

describe('CsrfTokenQueryService', () => {
  let service: CsrfTokenQueryService;
  const repo = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
  const hasher = {
    hash: jest.fn(),
    verify: jest.fn(),
    timingSafeEqual: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfTokenQueryService,
        { provide: CSRF_TOKEN_REPOSITORY_TOKEN, useValue: repo },
        { provide: HASHER_TOKEN, useValue: hasher },
      ],
    }).compile();
    service = module.get(CsrfTokenQueryService);
  });

  it('fails closed when userId is empty', async () => {
    await expect(service.validateToken('', 'any-tok')).resolves.toBe(false);
    expect(repo.get).not.toHaveBeenCalled();
    expect(hasher.timingSafeEqual).not.toHaveBeenCalled();
  });

  it('fails closed when providedToken is empty', async () => {
    await expect(service.validateToken('user-1', '')).resolves.toBe(false);
    expect(repo.get).not.toHaveBeenCalled();
  });

  it('fails closed when repository has no stored token', async () => {
    repo.get.mockResolvedValueOnce(null);
    await expect(service.validateToken('user-1', 'tok')).resolves.toBe(false);
    expect(hasher.timingSafeEqual).not.toHaveBeenCalled();
  });

  it('delegates equal-length comparison to Hasher.timingSafeEqual (true)', async () => {
    repo.get.mockResolvedValueOnce('stored');
    hasher.timingSafeEqual.mockReturnValueOnce(true);
    await expect(service.validateToken('user-1', 'stored')).resolves.toBe(true);
    expect(hasher.timingSafeEqual).toHaveBeenCalledWith('stored', 'stored');
  });

  it('returns false when Hasher.timingSafeEqual rejects', async () => {
    repo.get.mockResolvedValueOnce('stored');
    hasher.timingSafeEqual.mockReturnValueOnce(false);
    await expect(service.validateToken('user-1', 'forged')).resolves.toBe(
      false,
    );
    expect(hasher.timingSafeEqual).toHaveBeenCalledWith('stored', 'forged');
  });
});
