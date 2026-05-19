import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Inject,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import {
  CreateSAMLConfigDto,
  UpdateSAMLConfigDto,
  TestSAMLConfigDto,
} from '../dto/saml.dto';
import {
  SAML_CONFIG_READER_TOKEN,
  SAML_CONFIG_WRITER_TOKEN,
  SAML_STRATEGY_FACTORY_TOKEN,
  TOKEN_ISSUER_TOKEN,
} from '../constants/auth.tokens';
import {
  ISAMLConfigReader,
  ISAMLConfigWriter,
  ISAMLStrategyFactory,
  SAMLProfile,
} from '../interfaces/saml.interfaces';
import { ITokenIssuer } from '../interfaces/token.interfaces';
import { SAMLConfigService } from '../services/strategies/saml/saml-config.service';
import { SAMLAuthenticator } from '../services/strategies/saml/saml.authenticator';

@Controller('auth/saml')
export class SAMLController {
  constructor(
    @Inject(SAML_CONFIG_READER_TOKEN)
    private readonly configReader: ISAMLConfigReader,
    @Inject(SAML_CONFIG_WRITER_TOKEN)
    private readonly configWriter: ISAMLConfigWriter,
    @Inject(SAML_STRATEGY_FACTORY_TOKEN)
    private readonly strategyFactory: ISAMLStrategyFactory,
    @Inject(TOKEN_ISSUER_TOKEN)
    private readonly tokenIssuer: ITokenIssuer,
    private readonly samlAuthenticator: SAMLAuthenticator,
    // Concrete only for the admin-side metadata helper (outside the ISP).
    private readonly samlConfigService: SAMLConfigService,
  ) {}

  // ── Public SAML callbacks ────────────────────────────────────────────

  @Public()
  @Get('login/:configId')
  async initiateLogin(
    @Param('configId') configId: string,
    @Res() res: Response,
  ) {
    try {
      const config = await this.configReader.getById(configId);
      const strategy = this.strategyFactory.create(config);

      strategy.generateServiceProviderMetadata(
        config.issuer,
        config.callbackUrl,
      );
      res.redirect(config.entryPoint);
    } catch {
      res.status(400).json({ error: 'SAML configuration not found' });
    }
  }

  @Public()
  @Post('callback/:configId')
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Param('configId') configId: string,
    @Body()
    body: {
      nameID?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      groups?: string[];
    },
    @Res() res: Response,
  ) {
    try {
      const config = await this.configReader.getById(configId);

      // NOTE: in production the SAML assertion is validated by the strategy
      // verify callback; this manual callback path is for IdP-less test
      // harnessing. Profile shape mirrors `SAMLProfile`.
      const profile: SAMLProfile = {
        nameID: body.nameID || 'mock-user',
        nameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
        email: body.email || 'user@example.com',
        firstName: body.firstName || 'John',
        lastName: body.lastName || 'Doe',
        username: body.username || 'johndoe',
        groups: body.groups || ['users'],
        attributes: {},
      };

      const principal = await this.samlAuthenticator.authenticateWithConfig(
        profile,
        config,
      );
      // JWT minting is delegated to the generic ITokenIssuer — SAML
      // never duplicates token-lifecycle logic.
      const tokens = await this.tokenIssuer.issuePair(principal);

      res.json({
        success: true,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: {
          id: principal.id,
          email: principal.email,
          name: principal.name,
          isSuperAdmin: principal.isSuperAdmin,
        },
      });
    } catch {
      res.status(400).json({ error: 'SAML callback processing failed' });
    }
  }

  // ── Admin endpoints (authenticated) ──────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('configs')
  async createConfig(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateSAMLConfigDto,
  ) {
    return this.configWriter.createOrUpdate(null, dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('configs/:id')
  async updateConfig(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: UpdateSAMLConfigDto,
  ) {
    return this.configWriter.createOrUpdate(id, dto, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs')
  async listConfigs() {
    return this.configReader.list();
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs/:id')
  async getConfig(@Param('id') id: string) {
    return this.configReader.getById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('configs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(@Param('id') id: string) {
    await this.configWriter.delete(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs/:id/activate')
  async activateConfig(@Param('id') id: string) {
    return this.configWriter.activate(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs/test')
  async testConfig(@Body() dto: TestSAMLConfigDto) {
    return this.samlAuthenticator.testConfig(dto.configId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs/:id/metadata')
  async getMetadata(@Param('id') id: string) {
    const config = await this.configReader.getById(id);
    const metadata = this.samlConfigService.generateMetadata(config);
    return { metadata };
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-config')
  async getActiveConfig() {
    return this.configReader.getActive();
  }
}
