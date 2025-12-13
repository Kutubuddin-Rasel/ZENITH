import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OnboardingService } from '../onboarding/services/onboarding.service';
import { RegisterDto } from './dto/register.dto';
import { SafeUser } from './types/safe-user.interface';
import { JwtRequestUser } from './types/jwt-request-user.interface';
import { RedeemInviteDto } from './dto/redeem-invite.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private invitesService: InvitesService,
    private projectMembersService: ProjectMembersService,
    private organizationsService: OrganizationsService,
    private onboardingService: OnboardingService,
    private configService: ConfigService,
  ) {}

  // Validate credentials for LocalStrategy
  async validateUser(email: string, pass: string): Promise<SafeUser | null> {
    const user = await this.usersService.findOneByEmail(email.toLowerCase());
    if (
      user &&
      user.isActive &&
      (await bcrypt.compare(pass, user.passwordHash))
    ) {
      // strip passwordHash before returning

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, hashedRefreshToken, ...result } = user;
      return result as SafeUser;
    }
    return null;
  }

  // Issue Access and Refresh Tokens
  async login(user: SafeUser) {
    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.isSuperAdmin,
      user.organizationId,
      user.name,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
        organizationId: user.organizationId,
      },
    };
  }

  /**
   * Main registration method.
   */
  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.usersService.findOneByEmail(
      dto.email.toLowerCase(),
    );
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    // If workspaceName provided, create organization
    let organizationId: string | undefined;
    let isSuperAdmin = false;

    if (dto.workspaceName) {
      const organization = await this.organizationsService.create({
        name: dto.workspaceName,
      });
      organizationId = organization.id;
      isSuperAdmin = true; // First user of workspace is Super Admin
    }

    const user = await this.usersService.create(
      dto.email.toLowerCase(),
      hash,
      dto.name,
      isSuperAdmin,
      organizationId,
    );

    // Initialize onboarding for the new user
    await this.onboardingService.initializeOnboarding(user.id);

    return user;
  }

  /**
   * Called when a user accepts an invite.
   */
  async redeemInvite(
    dto: RedeemInviteDto,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const invite = await this.invitesService.findOneByToken(dto.token);
    if (
      !invite ||
      invite.status !== 'Pending' ||
      (invite.expiresAt && invite.expiresAt < new Date())
    ) {
      throw new BadRequestException('Invite is invalid or has expired.');
    }

    const user = await this.usersService.findOneById(invite.inviteeId);
    if (!user) {
      throw new Error('Invitee user does not exist. Cannot redeem invite.');
    }

    await this.invitesService.respondToInvite(invite.id, user.id, true);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, hashedRefreshToken, ...safeUser } = user;
    return this.login(safeUser as SafeUser);
  }

  /**
   * Find user by ID for 2FA verification
   */
  async findUserById(userId: string): Promise<SafeUser> {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, hashedRefreshToken, ...safeUser } = user;
    return safeUser as SafeUser;
  }

  /**
   * Logout user by removing refresh token
   */
  async logout(userId: string) {
    return this.usersService.update(userId, { hashedRefreshToken: null });
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOneById(userId);

    // Impact: Reuse Detection
    // If user has no refresh token, access is denied.
    if (!user || !user.hashedRefreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!tokenMatches) {
      // SECURITY CRITICAL: Token Reuse Detected!
      // The provided refresh token is valid (checked by guard/strategy) but does not match the current database hash.
      // This implies an old token is being used (likely stolen).
      // Action: Invalidate ALL tokens for this user immediately.
      await this.usersService.update(userId, { hashedRefreshToken: null });
      throw new ForbiddenException('Access Denied - Token Reuse Detected');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.isSuperAdmin,
      user.organizationId,
      user.name,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.update(userId, {
      hashedRefreshToken: hash,
    });
  }

  async getTokens(
    userId: string,
    email: string,
    isSuperAdmin: boolean,
    organizationId: string | undefined,
    name: string,
  ) {
    const payload: JwtRequestUser = {
      userId,
      email,
      isSuperAdmin,
      organizationId,
      name,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET')!,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: '7d',
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }
}
