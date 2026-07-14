import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import {
  dollarsToCloverCents,
  parseCloverWebhookPayload,
  verifyCloverWebhookSignature
} from "./clover";

describe("dollarsToCloverCents", () => {
  it("rounds to nearest cent", () => {
    expect(dollarsToCloverCents(10)).toBe(1000);
    expect(dollarsToCloverCents(12.345)).toBe(1235);
  });
});

describe("verifyCloverWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const secret = "hcp_test_secret";
    const raw = '{"status":"APPROVED","data":"session-1"}';
    const t = "1642599079";
    const v1 = createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");
    expect(verifyCloverWebhookSignature(raw, `t=${t},v1=${v1}`, secret)).toBe(true);
  });

  it("rejects tampered bodies", () => {
    const secret = "hcp_test_secret";
    const raw = '{"status":"APPROVED"}';
    const t = "1642599079";
    const v1 = createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");
    expect(verifyCloverWebhookSignature('{"status":"DECLINED"}', `t=${t},v1=${v1}`, secret)).toBe(
      false
    );
  });
});

describe("parseCloverWebhookPayload", () => {
  it("parses payment notifications", () => {
    const payload = parseCloverWebhookPayload(
      JSON.stringify({
        type: "PAYMENT",
        status: "APPROVED",
        id: "pay_1",
        data: "session_abc"
      })
    );
    expect(payload?.status).toBe("APPROVED");
    expect(payload?.data).toBe("session_abc");
  });
});
