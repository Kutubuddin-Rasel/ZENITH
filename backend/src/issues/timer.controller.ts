import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';
import { TimerService } from './timer.service';
import { StartTimerDto } from './dto/start-timer.dto';
import { StopTimerDto } from './dto/stop-timer.dto';
import { ActiveTimerPayload, TimerStatus } from './dto/timer.interface';
import { WorkLog } from './entities/work-log.entity';

@Controller('timer')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard)
export class TimerController {
  constructor(private readonly timerService: TimerService) {}

  @Post('start')
  @RequireCsrf()
  async start(
    @Request() req: { user: { userId: string } },
    @Body() dto: StartTimerDto,
  ): Promise<ActiveTimerPayload> {
    return this.timerService.start(req.user.userId, dto.projectId, dto.issueId);
  }

  @Post('stop')
  @RequireCsrf()
  async stop(
    @Request() req: { user: { userId: string } },
    @Body() dto: StopTimerDto,
  ): Promise<WorkLog> {
    return this.timerService.stop(req.user.userId, {
      note: dto.note,
      billable: dto.billable,
      hourlyRate: dto.hourlyRate,
    });
  }

  @Get('status')
  async status(
    @Request() req: { user: { userId: string } },
  ): Promise<TimerStatus | null> {
    return this.timerService.status(req.user.userId);
  }
}
