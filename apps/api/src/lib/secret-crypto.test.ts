import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./secret-crypto";

describe("secret-crypto", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("hcp_test_secret_value");
    expect(enc).toBeTruthy();
    expect(decryptSecret(enc)).toBe("hcp_test_secret_value");
  });

  it("returns null for empty input", () => {
    expect(encryptSecret("")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});
