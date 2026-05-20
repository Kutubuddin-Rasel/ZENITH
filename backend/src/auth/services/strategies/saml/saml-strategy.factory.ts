import { Inject, Injectable } from '@nestjs/common';
import * as saml from '@node-saml/passport-saml';

import { SAMLConfig } from '../../../entities/saml-config.entity';
import { SAML_IDENTITY_PROVISIONER_TOKEN } from '../../../constants/auth.tokens';
import { AuthPrincipal } from '../../../interfaces/core.interfaces';
import {
  ISAMLIdentityProvisioner,
  ISAMLStrategyFactory,
  SAMLProfile,
} from '../../../interfaces/saml.interfaces';

type SamlDoneCallback = (err: unknown, user?: AuthPrincipal) => void;

/**
 * Step 4 — Passport SAML strategy factory. Pure synchronous construction:
 * no I/O, no session state. Each {@link create} call builds a strategy
 * whose verify callback delegates to {@link ISAMLIdentityProvisioner}.
 */
@Injectable()
export class SAMLStrategyFactory implements ISAMLStrategyFactory {
  constructor(
    @Inject(SAML_IDENTITY_PROVISIONER_TOKEN)
    private readonly provisioner: ISAMLIdentityProvisioner,
  ) {}

  create(config: SAMLConfig): saml.Strategy {
    const strategyConfig = {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      idpCert: config.cert,
      privateCert: config.privateCert,
      privateKey: config.privateKey,
      callbackUrl: config.callbackUrl,
      logoutUrl: config.logoutUrl,
      wantAssertionsSigned: config.wantAssertionsSigned,
      wantAuthnResponseSigned: config.wantAuthnResponseSigned,
      forceAuthn: config.forceAuthn,
      acceptedClockSkewMs: config.acceptedClockSkewMs,
      maxAssertionAgeMs: config.maxAssertionAgeMs,
      passReqToCallback: true,
    };

    return new saml.Strategy(
      strategyConfig,
      (_req, profile, done) => {
        const safeDone = done as unknown as SamlDoneCallback;
        const samlProfile = this.normaliseProfile(
          profile as Record<string, unknown>,
          config,
        );

        this.provisioner
          .provision(samlProfile, config)
          .then((principal) => safeDone(null, principal))
          .catch((err: unknown) => safeDone(err, undefined));
      },
      (_req, _profile, done) => {
        // Logout verification not implemented yet.
        done(null, undefined);
      },
    );
  }

  /**
   * Normalise the raw IdP attribute bag into the canonical
   * {@link SAMLProfile} shape consumed by the provisioner.
   */
  normaliseProfile(
    profile: Record<string, unknown>,
    config: SAMLConfig,
  ): SAMLProfile {
    const email = this.extractAttribute(
      profile,
      config.attributeMapping?.email || 'email',
    );
    if (!email) {
      throw new Error('Email is required for SAML authentication');
    }

    return {
      nameID: this.extractAttribute(profile, 'nameID') ?? '',
      nameIDFormat: this.extractAttribute(profile, 'nameIDFormat'),
      email,
      firstName: this.extractAttribute(
        profile,
        config.attributeMapping?.firstName || 'firstName',
      ),
      lastName: this.extractAttribute(
        profile,
        config.attributeMapping?.lastName || 'lastName',
      ),
      username: this.extractAttribute(
        profile,
        config.attributeMapping?.username || 'username',
      ),
      groups: this.extractGroups(
        profile,
        config.attributeMapping?.groups || 'groups',
      ),
      attributes: profile,
    };
  }

  private extractAttribute(
    profile: Record<string, unknown>,
    attributeName: string,
  ): string | undefined {
    if (!attributeName) return undefined;
    const raw = profile[attributeName];
    if (Array.isArray(raw)) {
      const first: unknown = (raw as unknown[])[0];
      return typeof first === 'string' ? first : String(first);
    }
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
    return undefined;
  }

  private extractGroups(
    profile: Record<string, unknown>,
    groupsAttribute: string,
  ): string[] {
    if (!groupsAttribute) return [];
    const groups = profile[groupsAttribute];
    if (Array.isArray(groups)) {
      return groups.map((g) => String(g));
    }
    if (typeof groups === 'string') {
      return groups.split(',').map((g) => g.trim());
    }
    return [];
  }
}
