const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range";

async function sha1Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** k-anonymity check against Have I Been Pwned (password prefix only leaves the device). */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!password) return false;

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      headers: { "Add-Padding": "true" }
    });

    if (!response.ok) {
      // Fail open on HIBP outage — server hook still enforces when reachable.
      return false;
    }

    const body = await response.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix && Number(count) > 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export const PASSWORD_BREACH_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different password.";
