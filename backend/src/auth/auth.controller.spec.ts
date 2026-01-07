import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { CookieService } from './services/cookie.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    redeemInvite: jest.fn(),
    findUserById: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
  };

  const mockTwoFactorService = {
    isEnabled: jest.fn(),
    verifyToken: jest.fn(),
  };

  const mockCookieService = {
    setAuthCookies: jest.fn(),
    clearAuthCookies: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: TwoFactorAuthService, useValue: mockTwoFactorService },
        { provide: CookieService, useValue: mockCookieService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
