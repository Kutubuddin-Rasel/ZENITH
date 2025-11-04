import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreferences } from './entities/user-preferences.entity';
import { ProjectTemplate } from '../project-templates/entities/project-template.entity';
import { SmartDefaultsService } from './services/smart-defaults.service';
import { SmartDefaultsController } from './controllers/smart-defaults.controller';
import { ProjectTemplatesModule } from '../project-templates/project-templates.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserPreferences, ProjectTemplate]),
    forwardRef(() => ProjectTemplatesModule),
    MembershipModule,
  ],
  providers: [SmartDefaultsService],
  controllers: [SmartDefaultsController],
  exports: [SmartDefaultsService],
})
export class UserPreferencesModule {}
