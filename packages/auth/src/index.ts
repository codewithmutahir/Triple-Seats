export type { AuthSession, AuthUser } from "./types.js";
export { checkMiddlewareSession, type MiddlewareSessionCheck } from "./middleware.js";

/** Cookie cache settings shared between API auth config and documentation. */
export const AUTH_COOKIE_CACHE_MAX_AGE_SECONDS = 5 * 60;
