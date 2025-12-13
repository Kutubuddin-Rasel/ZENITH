import { Module } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory';
import { PoliciesGuard } from './policies.guard';
import { MembershipModule } from '../../membership/membership.module'; // Depend on Membership for Roles
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [MembershipModule, CacheModule],
  providers: [CaslAbilityFactory, PoliciesGuard],
  exports: [CaslAbilityFactory, PoliciesGuard],
})
export class CaslModule {}
