import { Injectable, UnauthorizedException } from '@nestjs/common';

import { SAMLConfig } from '../../../entities/saml-config.entity';
import { AuthUserRepository } from '../../../repositories/abstract/auth-user.repository.abstract';
import { SAMLConfigRepository } from '../../../repositories/abstract/saml-config.repository.abstract';
import { AuthPrincipal } from '../../../interfaces/core.interfaces';
import {
  ISAMLIdentityProvisioner,
  SAMLProfile,
} from '../../../interfaces/saml.interfaces';

/**
 * Step 4 — Just-In-Time identity provisioning for SAML SSO. Resolves an
 * IdP-asserted profile to an internal {@link AuthPrincipal}, creating the
 * user on first sight and mirroring identity fields on every subsequent
 * login.
 *
 * Does NOT mint JWTs — token issuance is the {@link ITokenIssuer}'s job.
 */
@Injectable()
export class SAMLIdentityProvisioner implements ISAMLIdentityProvisioner {
  constructor(
    private readonly userRepo: AuthUserRepository,
    private readonly samlConfigRepo: SAMLConfigRepository,
  ) {}

  async provision(
    profile: SAMLProfile,
    config: SAMLConfig,
  ): Promise<AuthPrincipal> {
    const email = profile.email.toLowerCase();
    const name = this.buildFullName(
      profile.firstName,
      profile.lastName,
      profile.nameID,
    );
    const isSuperAdmin = this.isSuperAdmin(profile.groups, config.groupMapping);

    let user = await this.userRepo.findByEmail(email);

    if (!user) {
      user = this.userRepo.create({
        email,
        name,
        passwordHash: '', // SAML users authenticate via the IdP, not a local hash.
        isActive: true,
        isSuperAdmin,
        organizationId: config.organizationId, // JIT bind to the SSO tenant.
      });
      user = await this.userRepo.save(user);
    } else {
      user.name = name;
      user.isActive = true;
      user.isSuperAdmin = isSuperAdmin;
      user = await this.userRepo.save(user);
    }

    // Update SAML config usage stats.
    config.usageCount += 1;
    config.lastUsedAt = new Date();
    await this.samlConfigRepo.save(config);

    // Enforce strict tenant isolation when the SAML config is org-scoped.
    if (config.organizationId) {
      if (
        user.organizationId &&
        user.organizationId !== config.organizationId
      ) {
        throw new UnauthorizedException(
          'User already belongs to a different organization.',
        );
      }
      if (!user.organizationId) {
        user.organizationId = config.organizationId;
        user = await this.userRepo.save(user);
      }
    }

    const {
      passwordHash: _passwordHash,
      hashedRefreshToken: _hashedRefreshToken,
      ...safeUser
    } = user;
    return safeUser as AuthPrincipal;
  }

  private buildFullName(
    firstName?: string,
    lastName?: string,
    nameID?: string,
  ): string {
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (lastName) return lastName;
    if (nameID) return nameID;
    return 'SAML User';
  }

  private isSuperAdmin(
    groups: ReadonlyArray<string>,
    groupMapping?: Readonly<Record<string, string>>,
  ): boolean {
    if (!groups || !groupMapping) return false;
    return groups.some((group) => groupMapping[group] === 'Super-Admin');
  }
}
