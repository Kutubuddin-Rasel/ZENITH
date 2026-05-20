import { BadRequestException, Injectable } from '@nestjs/common';

import { SAMLConfig, SAMLStatus } from '../../../entities/saml-config.entity';
import { SAMLConfigRepository } from '../../../repositories/abstract/saml-config.repository.abstract';
import {
  ISAMLConfigReader,
  ISAMLConfigWriter,
  SAMLConfigInput,
} from '../../../interfaces/saml.interfaces';

/**
 * Step 4 — SAML configuration CRUD. Implements both reader and writer
 * contracts; consumers inject the role they need via
 * {@link SAML_CONFIG_READER_TOKEN} / {@link SAML_CONFIG_WRITER_TOKEN}.
 *
 * Owns the activation invariant (at-most-one ACTIVE row) and the metadata
 * XML emission used by admin tooling.
 */
@Injectable()
export class SAMLConfigService implements ISAMLConfigReader, ISAMLConfigWriter {
  constructor(private readonly samlConfigRepo: SAMLConfigRepository) {}

  // ── ISAMLConfigReader ────────────────────────────────────────────────

  async getById(configId: string): Promise<SAMLConfig> {
    const config = await this.samlConfigRepo.findById(configId);
    if (!config) {
      throw new BadRequestException('SAML configuration not found');
    }
    return config;
  }

  async list(): Promise<SAMLConfig[]> {
    return this.samlConfigRepo.listOrderedByCreatedDesc();
  }

  async getActive(): Promise<SAMLConfig | null> {
    return this.samlConfigRepo.findActive();
  }

  // ── ISAMLConfigWriter ────────────────────────────────────────────────

  async createOrUpdate(
    configId: string | null,
    input: SAMLConfigInput,
    createdById: string,
  ): Promise<SAMLConfig> {
    let config: SAMLConfig;

    if (configId) {
      config = await this.getById(configId);
    } else {
      config = this.samlConfigRepo.create({ createdById });
    }

    Object.assign(config, input);
    config.status = SAMLStatus.TESTING;

    return this.samlConfigRepo.save(config);
  }

  async delete(configId: string): Promise<void> {
    const config = await this.getById(configId);
    await this.samlConfigRepo.remove(config);
  }

  async activate(configId: string): Promise<SAMLConfig> {
    const config = await this.getById(configId);
    await this.samlConfigRepo.demoteActiveConfigs();
    config.status = SAMLStatus.ACTIVE;
    return this.samlConfigRepo.save(config);
  }

  // ── Admin tooling — outside the ISP surface, but config-centric ─────

  /** Emit SP-side SAML 2.0 metadata XML for the supplied configuration. */
  generateMetadata(config: SAMLConfig): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${config.issuer}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="true" WantAssertionsSigned="true">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${config.cert}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${config.callbackUrl}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }
}
