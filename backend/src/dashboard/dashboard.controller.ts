import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('my-focus')
  async getMyFocus(@Request() req: { user: JwtRequestUser }) {
    return this.dashboardService.getMyFocus(req.user.userId);
  }
}
