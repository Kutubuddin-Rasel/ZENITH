import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { SearchAnalytics } from './entities/search-analytics.entity';
import { TenantModule } from '../core/tenant/tenant.module';

import { CacheModule } from '../cache/cache.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, Project, User, SearchAnalytics]),
    TenantModule,
    CacheModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
