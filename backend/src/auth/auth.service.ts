import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { InvitesService } from '../invites/invites.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { SafeUser } from './types/safe-user.interface';
import { JwtRequestUser } from './types/jwt-request-user.interface';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
import { Invite } from 'src/invites/entities/invite.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private invitesService: InvitesService,
    private projectMembersService: ProjectMembersService,
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
      const { passwordHash, ...result } = user;
      return result as SafeUser;
    }
    return null;
  }

  // Issue a JWT
  async login(user: SafeUser) {
    const payload: JwtRequestUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  /**
   * Main registration method.
   * Can be called directly or as part of redeeming an invite.
   */
  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.usersService.findOneByEmail(dto.email.toLowerCase());
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create(dto.email.toLowerCase(), hash, dto.name);
    return user;
  }

  /**
   * Called when a user accepts an invite.
   * If they are new, they register. If existing, they just get added to the project.
   */
  async redeemInvite(dto: RedeemInviteDto): Promise<{ accessToken?: string }> {
    const invite = await this.invitesService.findOneByToken(dto.token);
    if (!invite || invite.status !== 'Pending' || (invite.expiresAt && invite.expiresAt < new Date())) {
      throw new BadRequestException('Invite is invalid or has expired.');
    }

    let user = await this.usersService.findOneById(invite.inviteeId);
    if (!user) {
      throw new Error('Invitee user does not exist. Cannot redeem invite.');
    }

    await this.invitesService.respondToInvite(invite.id, user.id, true);

    const { passwordHash, ...safeUser } = user;
    const loginResult = await this.login(safeUser as SafeUser);
    return { accessToken: loginResult.access_token };
  }
}
