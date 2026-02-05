import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import * as argon2 from 'argon2';

interface CreateAdminOptions {
  email?: string;
  password?: string;
  name?: string;
}

@Injectable()
@Command({
  name: 'create-admin',
  description: 'Create a new superadmin user',
  arguments: '[email] [password] [name]',
  options: { isDefault: false },
})
export class CreateAdminCommand extends CommandRunner {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  async run(inputs: string[], options?: CreateAdminOptions): Promise<void> {
    try {
      // Get values from arguments or options or use defaults
      const email = inputs[0] || options?.email || 'admin@zenith.com';
      const password =
        inputs[1] || options?.password || this.generatePassword();
      const name = inputs[2] || options?.name || 'Administrator';

      // Check if user already exists
      const existing = await this.usersService.findOneByEmail(email);
      if (existing) {
        console.error('❌ Error: User with this email already exists');
        process.exit(1);
      }

      // Hash password with Argon2id
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // Create admin user directly via repository (bypassing service validation)

      const userRepository = (this.usersService as any)['userRepository'];

      const admin = userRepository.create({
        email: email.toLowerCase(),
        passwordHash,
        name,
        isSuperAdmin: true,
        isActive: true,
        mustChangePassword: false,
        passwordVersion: 3, // Argon2id
      });


      await userRepository.save(admin);

      console.log('\n========================================');
      console.log('✅ Superadmin Created Successfully!');
      console.log('========================================');
      console.log(`Email:    ${email}`);
      console.log(`Password: ${password}`);
      console.log(`Name:     ${name}`);
      console.log('========================================');
      console.log('⚠️  Save these credentials securely!');
      console.log('========================================\n');

      process.exit(0);
    } catch (error) {
      console.error('❌ Error creating superadmin:', (error as Error).message);
      process.exit(1);
    }
  }

  @Option({
    flags: '-e, --email <email>',
    description: 'Admin email address',
  })
  parseEmail(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --password <password>',
    description: 'Admin password',
  })
  parsePassword(val: string): string {
    return val;
  }

  @Option({
    flags: '-n, --name <name>',
    description: 'Admin full name',
  })
  parseName(val: string): string {
    return val;
  }

  private generatePassword(): string {
    // Generate a random secure password
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
