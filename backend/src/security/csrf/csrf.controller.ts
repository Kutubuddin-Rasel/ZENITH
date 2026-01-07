import { Controller, Get, Request } from '@nestjs/common';
import { CsrfService } from './csrf.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@Controller('auth')
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Get CSRF token for the authenticated user
   * Multi-tab safe: returns existing token if valid
   */
  @Get('csrf-token')
  async getCsrfToken(@Request() req: AuthenticatedRequest) {
    const token = await this.csrfService.generateToken(req.user.userId);
    return { csrfToken: token };
  }
}
