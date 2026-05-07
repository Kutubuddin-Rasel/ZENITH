import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OnboardingProgress } from './entities/onboarding-progress.entity';
import { OnboardingAnalytics } from './entities/onboarding-analytics.entity';
import { OnboardingService } from './services/onboarding.service';
import { OnboardingController } from './controllers/onboarding.controller';
import { OnboardingAnalyticsListener } from './listeners/onboarding-analytics.listener';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OnboardingProgress, OnboardingAnalytics]),
    EventEmitterModule.forRoot(),
    ProjectsModule,
    MembershipModule,
  ],
  providers: [OnboardingService, OnboardingAnalyticsListener],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}
