import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as saml from '@node-saml/passport-saml';
import { JwtService } from '@nestjs/jwt';
import {
  SAMLConfig,
  SAMLProvider,
  SAMLStatus,
} from '../entities/saml-config.entity';
import { User } from '../../users/entities/user.entity';
import { AuthService } from '../auth.service';
import { OrganizationsService } from '../../organizations/organizations.service';

export interface SAMLUser {
  nameID: string;
  nameIDFormat: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  groups?: string[];
  attributes: { [key: string]: any };
}

export interface SAMLConfigDto {
  name: string;
  provider: SAMLProvider;
  entryPoint: string;
  issuer: string;
  cert: string;
  privateCert?: string;
  privateKey?: string;
  callbackUrl?: string;
  logoutUrl?: string;
  attributeMapping?: {
    email: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    groups?: string;
  };
  groupMapping?: { [key: string]: string };
  metadataUrl?: string;
  metadata?: string;
  organizationId?: string;
}

@Injectable()
export class SAMLService {
  constructor(
    @InjectRepository(SAMLConfig)
    private samlConfigRepo: Repository<SAMLConfig>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private authService: AuthService,
    private jwtService: JwtService,
    private organizationsService: OrganizationsService,
  ) {}

  /**
   * Create or update SAML configuration
   */
  async createOrUpdateConfig(
    configId: string | null,
    dto: SAMLConfigDto,
    createdById: string,
  ): Promise<SAMLConfig> {
    let config: SAMLConfig;

    if (configId) {
      const foundConfig = await this.samlConfigRepo.findOne({
        where: { id: configId },
      });
      if (!foundConfig) {
        throw new BadRequestException('SAML configuration not found');
      }
      config = foundConfig;
    } else {
      config = this.samlConfigRepo.create({ createdById });
    }

    // Update configuration
    Object.assign(config, dto);
    config.status = SAMLStatus.TESTING; // Start in testing mode

    return this.samlConfigRepo.save(config);
  }

  /**
   * Get SAML configuration by ID
   */
  async getConfig(configId: string): Promise<SAMLConfig> {
    const config = await this.samlConfigRepo.findOne({
      where: { id: configId },
    });
    if (!config) {
      throw new BadRequestException('SAML configuration not found');
    }
    return config;
  }

  /**
   * List all SAML configurations
   */
  async listConfigs(): Promise<SAMLConfig[]> {
    return this.samlConfigRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete SAML configuration
   */
  async deleteConfig(configId: string): Promise<void> {
    const config = await this.getConfig(configId);
    await this.samlConfigRepo.remove(config);
  }

  /**
   * Activate SAML configuration
   */
  async activateConfig(configId: string): Promise<SAMLConfig> {
    const config = await this.getConfig(configId);

    // Deactivate all other configs
    await this.samlConfigRepo.update(
      { status: SAMLStatus.ACTIVE },
      { status: SAMLStatus.INACTIVE },
    );

    // Activate this config
    config.status = SAMLStatus.ACTIVE;
    return this.samlConfigRepo.save(config);
  }

  /**
   * Get active SAML configuration
   */
  async getActiveConfig(): Promise<SAMLConfig | null> {
    return this.samlConfigRepo.findOne({
      where: { status: SAMLStatus.ACTIVE },
    });
  }

  /**
   * Create SAML strategy for Passport
   */
  createStrategy(config: SAMLConfig): saml.Strategy {
    const strategyConfig = {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      idpCert: config.cert, // Use idpCert instead of cert
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
        const safeDone = done as unknown as (err: any, user?: any) => void;
        // Avoid returning a Promise directly to callbacks
        this.handleSAMLUser(profile as Record<string, unknown>, config)
          .then((user) => safeDone(null, user))
          .catch((err: unknown) => safeDone(err, undefined));
      },
      (_req, _profile, done) => {
        // Logout verification - not implemented yet
        done(null, undefined);
      },
    );
  }

  /**
   * Handle SAML user authentication
   */
  async handleSAMLUser(
    profile: Record<string, unknown>,
    config: SAMLConfig,
  ): Promise<User> {
    const email = this.extractAttribute(
      profile,
      config.attributeMapping?.email || 'email',
    );
    if (!email) {
      throw new UnauthorizedException(
        'Email is required for SAML authentication',
      );
    }

    const nameID = this.extractAttribute(profile, 'nameID');
    const nameIDFormat = this.extractAttribute(profile, 'nameIDFormat');

    const samlUser: SAMLUser = {
      nameID: nameID || '',
      nameIDFormat: nameIDFormat || '',
      email: email,
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
      groups:
        this.extractGroups(
          profile,
          config.attributeMapping?.groups || 'groups',
        ) || [],
      attributes: profile,
    };

    // Find or create user
    let user = await this.userRepo.findOne({
      where: { email: samlUser.email.toLowerCase() },
    });

    if (!user) {
      // Create new user
      const name = this.buildFullName(
        samlUser.firstName,
        samlUser.lastName,
        samlUser.nameID,
      );
      user = this.userRepo.create({
        email: samlUser.email.toLowerCase(),
        name: name,
        passwordHash: '', // SAML users don't have passwords
        isActive: true,
        isSuperAdmin: this.isSuperAdmin(
          samlUser.groups || [],
          config.groupMapping,
        ),
        organizationId: config.organizationId, // JIT Bind to Organization
      });
      user = await this.userRepo.save(user);
    } else {
      // Update existing user
      const name = this.buildFullName(
        samlUser.firstName,
        samlUser.lastName,
        samlUser.nameID,
      );
      user.name = name;
      user.isActive = true;
      user.isSuperAdmin = this.isSuperAdmin(
        samlUser.groups || [],
        config.groupMapping,
      );
      user = await this.userRepo.save(user);
    }

    // Update usage statistics
    config.usageCount += 1;
    config.lastUsedAt = new Date();
    await this.samlConfigRepo.save(config);

    // Authorization: Check if user is meant for this organization
    if (config.organizationId) {
      if (user) {
        // Enforce: User MUST belong to the organization tied to this SAML config
        // Case 1: User belongs to this org -> OK
        // Case 2: User belongs to another org -> Fail? Or Auto-Join?
        // Enterprise Rule: Strict Isolation. If user is in Org A, and logs in via Org B's SAML, they should probably be rejected unless we support Multi-Org users.
        // Current User entity only supports single organizationId.
        if (
          user.organizationId &&
          user.organizationId !== config.organizationId
        ) {
          throw new UnauthorizedException(
            'User already belongs to a different organization.',
          );
        }

        // If user has no org, bind them
        if (!user.organizationId) {
          user.organizationId = config.organizationId;
          await this.userRepo.save(user);
        }
      }
    }

    return user;
  }

  /**
   * Extract attribute from SAML profile
   */
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

  /**
   * Extract groups from SAML profile
   */
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

  /**
   * Build full name from available parts
   */
  private buildFullName(
    firstName?: string,
    lastName?: string,
    nameID?: string,
  ): string {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) {
      return firstName;
    }
    if (lastName) {
      return lastName;
    }
    if (nameID) {
      return nameID;
    }
    return 'SAML User';
  }

  /**
   * Check if user should be Super Admin based on groups
   */
  private isSuperAdmin(
    groups: string[],
    groupMapping?: { [key: string]: string },
  ): boolean {
    if (!groups || !groupMapping) return false;

    return groups.some((group) => groupMapping[group] === 'Super-Admin');
  }

  /**
   * Generate SAML metadata
   */
  generateMetadata(config: SAMLConfig): string {
    // Shape preserved here for future XML builders; direct XML string returned below

    // Convert to XML (simplified - in production, use proper XML library)
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

  /**
   * Test SAML configuration
   */
  async testConfig(
    configId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.getConfig(configId);

      // Basic validation
      if (!config.entryPoint || !config.issuer || !config.cert) {
        return {
          success: false,
          message: 'Missing required SAML configuration',
        };
      }

      // Try to create strategy (this will validate the configuration)
      this.createStrategy(config);

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

  /**
   * Generate JWT token for SAML user
   */
  generateJWTToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    };
    return this.jwtService.sign(payload);
  }
}
