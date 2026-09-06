/**
 * Abstract persistence ports for the session module (binding targets).
 *
 * The contracts are declared in `interfaces/session.interfaces.ts` and
 * re-exported here so the `repositories/` layer owns a stable import path for
 * its concrete implementations and module bindings — mirroring the
 * `access-control/repositories/abstract` precedent.
 */
export {
  ISessionStore,
  ISessionUserLookup,
} from '../../interfaces/session.interfaces';
