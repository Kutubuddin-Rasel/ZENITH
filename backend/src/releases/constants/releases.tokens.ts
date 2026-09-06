// src/releases/constants/releases.tokens.ts
//
// DI tokens for the releases module's segregated contracts. Consumers (the
// controller, external modules) inject these symbols, never the concrete
// service/repository classes — preserving DIP across the module boundary.

/** Read surface — `IReleaseQuery`. Also the external seam (attachments). */
export const RELEASE_QUERY_TOKEN = Symbol('RELEASE_QUERY_TOKEN');

/** Write surface — `IReleaseCommand`. */
export const RELEASE_COMMAND_TOKEN = Symbol('RELEASE_COMMAND_TOKEN');

/** Deployment/webhook surface — `IReleaseDeployment` (SSRF-sensitive). */
export const RELEASE_DEPLOYMENT_TOKEN = Symbol('RELEASE_DEPLOYMENT_TOKEN');

/** Release-notes generation surface — `IReleaseNotes`. */
export const RELEASE_NOTES_TOKEN = Symbol('RELEASE_NOTES_TOKEN');

/** Persistence port — `IReleaseRepository`. The ClickHouse/ORM swap seam. */
export const RELEASE_REPOSITORY_TOKEN = Symbol('RELEASE_REPOSITORY_TOKEN');
