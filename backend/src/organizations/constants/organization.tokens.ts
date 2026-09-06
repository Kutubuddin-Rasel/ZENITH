/**
 * Organizations DI Tokens.
 *
 * Symbol-based injection tokens for the segregated contracts
 * in `../interfaces/organization.interfaces.ts`. Symbols guarantee
 * zero collision risk across the application graph.
 *
 * USAGE:
 *   constructor(@Inject(ORG_READER_TOKEN) private readonly orgReader: IOrganizationReader) {}
 *
 * @see SOLID_STANDARDS.md — DIP: "Define abstract interfaces or abstract classes
 *      as injection tokens, then bind concrete implementations via NestJS custom providers."
 */

export const ORG_READER_TOKEN: unique symbol = Symbol('ORG_READER_TOKEN');
export const ORG_WRITER_TOKEN: unique symbol = Symbol('ORG_WRITER_TOKEN');
export const INVITATION_SERVICE_TOKEN: unique symbol = Symbol(
  'INVITATION_SERVICE_TOKEN',
);
export const ORG_SETTINGS_READER_TOKEN: unique symbol = Symbol(
  'ORG_SETTINGS_READER_TOKEN',
);
export const ORG_SETTINGS_WRITER_TOKEN: unique symbol = Symbol(
  'ORG_SETTINGS_WRITER_TOKEN',
);
export const USER_LOOKUP_TOKEN: unique symbol = Symbol('USER_LOOKUP_TOKEN');
