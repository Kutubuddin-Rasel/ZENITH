import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../../audit/audit.module';
import { AuthCoreModule } from './auth-core.module';

import { SAMLConfig } from '../entities/saml-config.entity';

import { SAMLConfigService } from '../services/strategies/saml/saml-config.service';
import { SAMLIdentityProvisioner } from '../services/strategies/saml/saml-identity.provisioner';
import { SAMLStrategyFactory } from '../services/strategies/saml/saml-strategy.factory';
import { SAMLAuthenticator } from '../services/strategies/saml/saml.authenticator';
import { SAMLController } from '../controllers/saml.controller';

import { SAMLConfigRepository } from '../repositories/abstract/saml-config.repository.abstract';
import { PostgresSAMLConfigRepository } from '../repositories/concrete/postgres-saml-config.repository';

import {
  SAML_CONFIG_READER_TOKEN,
  SAML_CONFIG_WRITER_TOKEN,
  SAML_IDENTITY_PROVISIONER_TOKEN,
  SAML_STRATEGY_FACTORY_TOKEN,
} from '../constants/auth.tokens';

/**
 * Step 5 — SAML SSO sub-module.
 *
 * Houses the 4 segregated SAML services (config / provisioner / factory /
 * authenticator) plus the {@link SAMLConfigRepository} DIP binding and the
 * `SAMLController` admin-facing endpoints.
 *
 * Depends on {@link AuthCoreModule} for the `TOKEN_ISSUER_TOKEN`
 * (JWT minting was extracted out of the strategy in Step 4) and the
 * {@link AuthUserRepository} that the identity provisioner consumes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SAMLConfig]),
    AuditModule,
    AuthCoreModule,
  ],
  providers: [
    SAMLConfigService,
    { provide: SAML_CONFIG_READER_TOKEN, useExisting: SAMLConfigService },
    { provide: SAML_CONFIG_WRITER_TOKEN, useExisting: SAMLConfigService },
    SAMLIdentityProvisioner,
    {
      provide: SAML_IDENTITY_PROVISIONER_TOKEN,
      useExisting: SAMLIdentityProvisioner,
    },
    SAMLStrategyFactory,
    { provide: SAML_STRATEGY_FACTORY_TOKEN, useExisting: SAMLStrategyFactory },
    SAMLAuthenticator,
    { provide: SAMLConfigRepository, useClass: PostgresSAMLConfigRepository },
  ],
  controllers: [SAMLController],
  exports: [
    SAML_CONFIG_READER_TOKEN,
    SAML_CONFIG_WRITER_TOKEN,
    SAML_IDENTITY_PROVISIONER_TOKEN,
    SAML_STRATEGY_FACTORY_TOKEN,
  ],
})
export class SamlAuthModule {}
