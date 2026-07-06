import http from "k6/http";
import { check } from "k6";

import { jsonHeaders } from "./config.js";

/**
 * Sign in via Better Auth and return the cookie jar for follow-up requests.
 */
export function signIn(jar, baseUrl, webOrigin, email, password) {
  const res = http.post(
    `${baseUrl}/api/auth/sign-in/email`,
    JSON.stringify({ email, password }),
    {
      jar,
      headers: jsonHeaders(webOrigin),
      tags: { name: "auth_sign_in" }
    }
  );

  check(res, {
    "sign-in status 200": (r) => r.status === 200
  });

  return res;
}
