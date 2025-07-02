import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { InvitesModule } from './invites/invites.module';
import { MembershipModule } from './membership/membership.module';
import { ProjectsModule } from './projects/projects.module';
import { IssuesModule } from './issues/issues.module';
import { SprintsModule } from './sprints/sprints.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { BoardsModule } from './boards/boards.module';
import { ReleasesModule } from './releases/releases.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { EpicsModule } from './epics/epics.module';
import { BacklogModule } from './backlog/backlog.module';
import { WatchersModule } from './watchers/watchers.module';
import { RevisionsModule } from './revisions/revisions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    // Load .env file and make ConfigService available
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Configure TypeORM asynchronously using ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASS'),
        database: config.get<string>('DATABASE_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // disable in production, use migrations
      }),
    }),
    UsersModule,
    AuthModule,
    InvitesModule,
    MembershipModule,
    ProjectsModule,
    IssuesModule,
    SprintsModule,
    CommentsModule,
    AttachmentsModule,
    BoardsModule,
    ReleasesModule,
    TaxonomyModule,
    EpicsModule,
    BacklogModule,
    WatchersModule,
    RevisionsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
