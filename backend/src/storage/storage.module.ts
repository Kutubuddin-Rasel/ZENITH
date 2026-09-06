import { Module } from '@nestjs/common';

import { AvatarController } from './avatars/avatar.controller';
import { UsersModule } from '../users/users.module';

/**
 * Step 6 — Storage module owns file-upload endpoints that previously squatted
 * inside feature controllers (most notably the avatar upload that used to
 * live in `UsersController`). Importing `UsersModule` brings the
 * `USER_PROFILE_WRITER` ISP token into scope so `AvatarController` can
 * mutate the user record through the segregated contract.
 */
@Module({
  imports: [UsersModule],
  controllers: [AvatarController],
})
export class StorageModule {}
