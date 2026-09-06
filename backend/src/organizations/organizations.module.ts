import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Organization } from './entities/organization.entity';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationSettings } from './entities/organization-settings.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { InvitationService } from './services/invitation.service';
import { OrganizationsController } from './organizations.controller';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { MembershipModule } from '../membership/membership.module';
import { CsrfModule } from '../security/csrf';
// DIP: Abstract repository tokens
import { OrganizationRepository } from './repositories/abstract/organization.repository.abstract';
import { InvitationRepository } from './repositories/abstract/invitation.repository.abstract';
import { OrganizationSettingsRepository } from './repositories/abstract/organization-settings.repository.abstract';
// DIP: Concrete TypeORM implementations
import { PostgresOrganizationRepository } from './repositories/concrete/postgres-organization.repository';
import { PostgresInvitationRepository } from './repositories/concrete/postgres-invitation.repository';
import { PostgresOrganizationSettingsRepository } from './repositories/concrete/postgres-organization-settings.repository';
// DIP: Tokens
import {
  ORG_READER_TOKEN,
  ORG_WRITER_TOKEN,
  ORG_SETTINGS_READER_TOKEN,
  ORG_SETTINGS_WRITER_TOKEN,
  INVITATION_SERVICE_TOKEN,
  USER_LOOKUP_TOKEN,
} from './constants/organization.tokens';

/**
 * Organizations Module — Level 2 Identity Layer.
 *
 * BOUNDARY ENFORCEMENT (Step 5):
 * - OrganizationsService is INTERNAL — never exported.
 * - All external access goes through ISP tokens.
 * - Concrete classes are NEVER in exports.
 *
 * EXPORTS (tokens only):
 * - ORG_READER_TOKEN  → IOrganizationReader (findOne, findBySlug)
 * - ORG_WRITER_TOKEN  → IOrganizationWriter (create)
 * - ORG_SETTINGS_READER_TOKEN → IOrganizationSettingsReader
 * - ORG_SETTINGS_WRITER_TOKEN → IOrganizationSettingsWriter
 * - INVITATION_SERVICE_TOKEN → IInvitationService
 * - OrganizationRepository → Abstract data access (billing cross-domain)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationInvitation,
      OrganizationSettings,
    ]),
    EventEmitterModule.forRoot(),
    UsersModule,
    MembershipModule,
    CsrfModule,
  ],
  providers: [
    // DIP: Abstract → Concrete repository bindings
    {
      provide: OrganizationRepository,
      useClass: PostgresOrganizationRepository,
    },
    {
      provide: InvitationRepository,
      useClass: PostgresInvitationRepository,
    },
    {
      provide: OrganizationSettingsRepository,
      useClass: PostgresOrganizationSettingsRepository,
    },
    // DIP: USER_LOOKUP_TOKEN — wraps UsersService as IUserLookup adapter
    {
      provide: USER_LOOKUP_TOKEN,
      useExisting: UsersService,
    },
    // ISP: Service → Token bindings
    {
      provide: ORG_READER_TOKEN,
      useClass: OrganizationsService,
    },
    {
      provide: ORG_WRITER_TOKEN,
      useClass: OrganizationsService,
    },
    {
      provide: ORG_SETTINGS_READER_TOKEN,
      useClass: OrganizationSettingsService,
    },
    {
      provide: ORG_SETTINGS_WRITER_TOKEN,
      useExisting: ORG_SETTINGS_READER_TOKEN,
    },
    {
      provide: INVITATION_SERVICE_TOKEN,
      useClass: InvitationService,
    },
    // Internal services (not exported — used by token bindings)
    OrganizationsService,
    OrganizationSettingsService,
  ],
  controllers: [OrganizationsController],
  exports: [
    // ISP: ONLY tokens — zero concrete class leakage
    ORG_READER_TOKEN,
    ORG_WRITER_TOKEN,
    ORG_SETTINGS_READER_TOKEN,
    ORG_SETTINGS_WRITER_TOKEN,
    INVITATION_SERVICE_TOKEN,
    // DIP: Abstract repository for billing cross-domain access
    OrganizationRepository,
  ],
})
export class OrganizationsModule {}
