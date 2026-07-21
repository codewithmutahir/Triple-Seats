/**
 * Local smoke: Clover OAuth helpers (no browser).
 * Run: pnpm --filter api exec tsx --import ./src/preload.ts src/scripts/smoke-clover-oauth.mjs
 * Actually use .ts with tsx
 */
import {
  buildCloverAuthorizeUrl,
  cloverOAuthConfigured,
  cloverOAuthRedirectUri,
  createOAuthState,
  parseOAuthState
} from "../lib/clover-oauth";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(cloverOAuthConfigured(), "CLOVER_APP_ID/SECRET missing");
const redirect = cloverOAuthRedirectUri();
console.log("redirect_uri:", redirect);
assert(redirect.includes("/api/clover/oauth/callback"), "bad redirect path");

const state = createOAuthState("caterer_test_123");
const parsed = parseOAuthState(state);
assert(parsed?.catererId === "caterer_test_123", "state roundtrip failed");
assert(parseOAuthState("tampered.x") === null, "tampered state should fail");

const url = buildCloverAuthorizeUrl({ state });
console.log("authorize_url:", url);
assert(url.includes("sandbox.dev.clover.com/oauth/v2/authorize"), "expected sandbox authorize host");
assert(url.includes("client_id="), "missing client_id");
assert(url.includes("response_type=code"), "missing response_type");
assert(url.includes(encodeURIComponent(redirect)) || url.includes(redirect), "redirect_uri not in authorize URL");

console.log("SMOKE_OK clover-oauth helpers");
