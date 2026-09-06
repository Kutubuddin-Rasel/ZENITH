// src/releases/index.ts
//
// Sealed public barrel for the releases module (Level-4 [LIGHT]). External
// consumers import ONLY from here — the `RELEASES_DEEP_IMPORT_PATTERNS` ESLint
// rule bans reaching into services/repositories/controller/constants/
// interfaces/ports/utils/config. Two deliberate exceptions stay deep-importable
// (documented in eslint.config.mjs): the `Release` entity (revisions subscriber
// + attachments TypeORM relation) and the pagination DTO (search).

// ISP contracts + view/result types.
export * from './interfaces/releases.interfaces';

// DI tokens (query / command / deployment / notes / repository).
export * from './constants/releases.tokens';

// Outbound notification port (bound useExisting: WatchersService internally).
export { ReleaseNotificationPort } from './ports/release-notification.port';

// Public enums consumers may need for typing.
export { ReleaseStatus, GitProvider } from './entities/release.entity';
