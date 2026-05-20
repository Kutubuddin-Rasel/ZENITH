import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import {
  LoginHistoryService,
  LoginHistoryEntry,
} from './login-history.service';
import { LoginHistoryQueryDto } from './dto/login-history-query.dto';

/**
 * Step 4 relocation: the login-history HTTP surface now lives in auth, where
 * the recording side-effect already belongs. The route shape is preserved so
 * frontend clients keep working.
 */
@Controller('users')
export class LoginHistoryController {
  constructor(private readonly loginHistoryService: LoginHistoryService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/login-history')
  async getLoginHistory(
    @Request() req: AuthenticatedRequest,
    @Query() query: LoginHistoryQueryDto,
  ): Promise<ReadonlyArray<LoginHistoryEntry>> {
    return this.loginHistoryService.getHistory(req.user.userId, query.limit);
  }
}
