import { Module } from '@nestjs/common';
import { CreateAdminCommand } from './commands/create-admin.command';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [CreateAdminCommand],
})
export class CliModule {}
