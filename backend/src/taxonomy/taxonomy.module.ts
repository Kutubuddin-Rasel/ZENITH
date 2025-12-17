// src/taxonomy/taxonomy.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Label } from './entities/label.entity';
import { Component } from './entities/component.entity';
import { IssueLabel } from './entities/issue-label.entity';
import { IssueComponent } from './entities/issue-component.entity';
import { TaxonomyService } from './taxonomy.service';
import { TaxonomyController } from './taxonomy.controller';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService

@Module({
  imports: [
    TypeOrmModule.forFeature([Label, Component, IssueLabel, IssueComponent]),
    // REFACTORED: Direct imports since cycles are broken
    ProjectsModule,
    IssuesModule,
  ],
  providers: [TaxonomyService],
  controllers: [TaxonomyController],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
