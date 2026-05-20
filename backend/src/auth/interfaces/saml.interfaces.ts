/**
 * SAML SSO ISP Contracts.
 *
 * Decomposes the legacy 438-LOC `SAMLService` god-class into four focused
 * roles: config read, config write, Passport strategy construction, and
 * Just-In-Time identity provisioning. JWT minting is delegated to the
 * generic `ITokenIssuer` — SAML no longer duplicates token logic.
 *
 * @see SOLID_STANDARDS.md — SRP, ISP, DIP
 */

import type { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import { SAMLConfig, SAMLProvider } from '../entities/saml-config.entity';
import { AuthPrincipal } from './core.interfaces';

/** Attribute-mapping section of a SAML config payload. */
export interface SAMLAttributeMapping {
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly username?: string;
  readonly groups?: string;
}

/**
 * Write-side input for `ISAMLConfigWriter.createOrUpdate`. Decoupled from the
 * controller DTO so service code never depends on `class-validator` types.
 */
export interface SAMLConfigInput {
  readonly name: string;
  readonly provider: SAMLProvider;
  readonly entryPoint: string;
  readonly issuer: string;
  readonly cert: string;
  readonly privateCert?: string;
  readonly privateKey?: string;
  readonly callbackUrl?: string;
  readonly logoutUrl?: string;
  readonly attributeMapping?: SAMLAttributeMapping;
  readonly groupMapping?: Readonly<Record<string, string>>;
  readonly metadataUrl?: string;
  readonly metadata?: string;
  readonly organizationId?: string;
}

/**
 * Normalised view of the raw IdP assertion. Produced by the strategy
 * factory's verify callback; consumed by `ISAMLIdentityProvisioner`.
 */
export interface SAMLProfile {
  readonly nameID: string;
  readonly nameIDFormat?: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly username?: string;
  readonly groups: ReadonlyArray<string>;
  /** Full raw attribute bag — opaque to the auth layer. */
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** Read-only access to persisted SAML configurations. */
export interface ISAMLConfigReader {
  getById(configId: string): Promise<SAMLConfig>;
  list(): Promise<ReadonlyArray<SAMLConfig>>;
  /** Currently-active config across the tenant, or `null` when SSO is off. */
  getActive(): Promise<SAMLConfig | null>;
}

/** Mutation surface for SAML configurations. */
export interface ISAMLConfigWriter {
  createOrUpdate(
    configId: string | null,
    input: SAMLConfigInput,
    createdById: string,
  ): Promise<SAMLConfig>;
  delete(configId: string): Promise<void>;
  /** Promote one config to `ACTIVE`; all others demote to `INACTIVE`. */
  activate(configId: string): Promise<SAMLConfig>;
}

/**
 * Builds the Passport `Strategy` instance bound to a stored config. Pure
 * factory — no I/O, no session state. Each `create()` call is independent.
 */
export interface ISAMLStrategyFactory {
  create(config: SAMLConfig): SamlStrategy;
}

/**
 * Just-In-Time identity provisioning — resolves an IdP-asserted profile to
 * an internal `AuthPrincipal`, creating the user on first sight and
 * updating identity fields (name, superAdmin, active) on every login.
 *
 * MUST NOT mint JWTs — token issuance is the `ITokenIssuer`'s job.
 */
export interface ISAMLIdentityProvisioner {
  provision(profile: SAMLProfile, config: SAMLConfig): Promise<AuthPrincipal>;
}
