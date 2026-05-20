import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { SAMLConfig } from '../../../entities/saml-config.entity';
import {
  SAML_CONFIG_READER_TOKEN,
  SAML_IDENTITY_PROVISIONER_TOKEN,
  SAML_STRATEGY_FACTORY_TOKEN,
} from '../../../constants/auth.tokens';
import {
  AuthContext,
  AuthPrincipal,
  IAuthenticator,
} from '../../../interfaces/core.interfaces';
import {
  ISAMLConfigReader,
  ISAMLIdentityProvisioner,
  ISAMLStrategyFactory,
  SAMLProfile,
} from '../../../interfaces/saml.interfaces';

/**
 * Step 4 — SAML SSO authenticator. Orchestrates the active-config lookup
 * and delegates user materialisation to {@link ISAMLIdentityProvisioner}.
 *
 * JWT minting is intentionally absent — call sites (e.g. `SAMLController`)
 * pair this with {@link ITokenIssuer} to produce the response payload.
 */
@Injectable()
export class SAMLAuthenticator implements IAuthenticator<
  SAMLProfile,
  AuthPrincipal
> {
  constructor(
    @Inject(SAML_IDENTITY_PROVISIONER_TOKEN)
    private readonly provisioner: ISAMLIdentityProvisioner,
    @Inject(SAML_CONFIG_READER_TOKEN)
    private readonly configReader: ISAMLConfigReader,
    @Inject(SAML_STRATEGY_FACTORY_TOKEN)
    private readonly strategyFactory: ISAMLStrategyFactory,
  ) {}

  /**
   * Authenticate against the single currently-active SAML configuration.
   * Multi-config callers should resolve the {@link SAMLConfig} themselves
   * and call {@link authenticateWithConfig} instead.
   */
  async authenticate(
    profile: SAMLProfile,
    _ctx?: AuthContext,
  ): Promise<AuthPrincipal> {
    const config = await this.configReader.getActive();
    if (!config) {
      throw new UnauthorizedException('SAML SSO is not configured');
    }
    return this.provisioner.provision(profile, config);
  }

  /**
   * Per-config variant for tenant-scoped callbacks where the controller
   * already knows the `configId` (e.g. `POST /auth/saml/callback/:configId`).
   */
  async authenticateWithConfig(
    profile: SAMLProfile,
    config: SAMLConfig,
  ): Promise<AuthPrincipal> {
    return this.provisioner.provision(profile, config);
  }

  /**
   * Admin diagnostic — validates that a stored config can be turned into
   * a Passport strategy without runtime errors.
   */
  async testConfig(
    configId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.configReader.getById(configId);

      if (!config.entryPoint || !config.issuer || !config.cert) {
        return {
          success: false,
          message: 'Missing required SAML configuration',
        };
      }

      this.strategyFactory.create(config);
      return { success: true, message: 'SAML configuration is valid' };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Configuration error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
}
