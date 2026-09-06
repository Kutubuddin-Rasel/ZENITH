import { Injectable } from '@nestjs/common';

// Sealed-barrel consumption: the port + its DTO are exported from
// `issues/index.ts` — adapters never reach into `issues/ports/*` directly.
import { UserLookupPort, UserLookupResult } from '../../issues';
import { UsersService } from '../users.service';

/**
 * UserLookupAdapter — capability-owner side of the issues → users inversion.
 *
 * Implements the `UserLookupPort` contract that lives in
 * `issues/ports/user-lookup.port.ts`. Issues owns the contract (consumer);
 * the `@Global UsersCoreModule` binds this adapter (capability owner) and
 * re-exports the token, so the port inherits the same global reach
 * `UsersService` already has.
 *
 * Behaviour is preserved verbatim: `findOneById` delegates to
 * `UsersService.findOneById`, which throws `NotFoundException` for a missing
 * user (the issues archive/unarchive/remove paths relied on that 404).
 */
@Injectable()
export class UserLookupAdapter extends UserLookupPort {
  constructor(private readonly users: UsersService) {
    super();
  }

  async findOneById(userId: string): Promise<UserLookupResult | null> {
    const user = await this.users.findOneById(userId);
    return { id: user.id, isSuperAdmin: user.isSuperAdmin };
  }

  async findOneByEmail(email: string): Promise<UserLookupResult | null> {
    const user = await this.users.findOneByEmail(email);
    return user ? { id: user.id, isSuperAdmin: user.isSuperAdmin } : null;
  }
}
