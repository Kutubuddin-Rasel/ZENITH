// Barrel export for core module
export { CoreEntitiesModule } from './entities/core-entities.module';
export { ProjectCoreModule } from './membership/project-core.module';
export { UsersCoreModule } from './users/users-core.module';
export { AuthCoreModule } from './auth/auth-core.module';

// Re-export decorators for convenient imports
export * from './auth/decorators';

// Re-export guards for convenient imports
export * from './auth/guards';
