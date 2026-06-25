// src/attachments/constants/attachments.tokens.ts
export const ATTACHMENT_QUERY_TOKEN = Symbol('ATTACHMENT_QUERY_TOKEN');
export const ATTACHMENT_COMMAND_TOKEN = Symbol('ATTACHMENT_COMMAND_TOKEN');
export const ATTACHMENT_REPOSITORY_TOKEN = Symbol(
  'ATTACHMENT_REPOSITORY_TOKEN',
);

// The mandated storage-port token ALREADY EXISTS under `storage/`. Re-export it
// here so binders/consumers resolve the port from one canonical constants
// module instead of deep-importing the storage internals.
export { FILE_STORAGE_PROVIDER } from '../storage/interfaces/file-storage-provider.interface';
