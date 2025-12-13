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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SAMLService } from '../services/saml.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import {
  CreateSAMLConfigDto,
  UpdateSAMLConfigDto,
  TestSAMLConfigDto,
  // SAMLMetadataDto,
} from '../dto/saml.dto';

@Controller('auth/saml')
export class SAMLController {
  constructor(private samlService: SAMLService) {}

  // Public endpoints for SAML callbacks
  @Public()
  @Get('login/:configId')
  async initiateLogin(
    @Param('configId') configId: string,
    @Res() res: Response,
  ) {
    try {
      const config = await this.samlService.getConfig(configId);
      const strategy = this.samlService.createStrategy(config);

      // Redirect to SAML provider
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
      const config = await this.samlService.getConfig(configId);

      // For now, we'll simulate a successful SAML response
      // In a real implementation, you would validate the SAML response here
      const mockProfile = {
        nameID: body.nameID || 'mock-user',
        nameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
        email: body.email || 'user@example.com',
        firstName: body.firstName || 'John',
        lastName: body.lastName || 'Doe',
        username: body.username || 'johndoe',
        groups: body.groups || ['users'],
      };

      // Handle successful authentication
      const user = await this.samlService.handleSAMLUser(mockProfile, config);
      const token = this.samlService.generateJWTToken(user);

      res.json({
        success: true,
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isSuperAdmin: user.isSuperAdmin,
        },
      });
    } catch {
      res.status(400).json({ error: 'SAML callback processing failed' });
    }
  }

  // Admin endpoints (require authentication)
  @UseGuards(JwtAuthGuard)
  @Post('configs')
  async createConfig(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateSAMLConfigDto,
  ) {
    const userId = req.user.userId;
    return this.samlService.createOrUpdateConfig(null, dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('configs/:id')
  async updateConfig(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
    @Body() dto: UpdateSAMLConfigDto,
  ) {
    const userId = req.user.userId;
    return this.samlService.createOrUpdateConfig(id, dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs')
  async listConfigs() {
    return this.samlService.listConfigs();
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs/:id')
  async getConfig(@Param('id') id: string) {
    return this.samlService.getConfig(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('configs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(@Param('id') id: string) {
    await this.samlService.deleteConfig(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs/:id/activate')
  async activateConfig(@Param('id') id: string) {
    return this.samlService.activateConfig(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs/test')
  async testConfig(@Body() dto: TestSAMLConfigDto) {
    return this.samlService.testConfig(dto.configId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs/:id/metadata')
  async getMetadata(@Param('id') id: string) {
    const config = await this.samlService.getConfig(id);
    const metadata = this.samlService.generateMetadata(config);
    return { metadata };
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-config')
  async getActiveConfig() {
    return this.samlService.getActiveConfig();
  }
}
