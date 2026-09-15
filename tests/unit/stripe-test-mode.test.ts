import { afterEach, describe, expect, it, vi } from "vitest";

describe("Stripe client mode guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("refuses a live Stripe key so phase 1 cannot collect live money", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_not_allowed");
    const { getStripe } = await import("@/server/payments/stripe");

    expect(() => getStripe()).toThrow("Stripe live mode is disabled");
  });

  it("accepts a Stripe test key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    const { getStripe } = await import("@/server/payments/stripe");

    expect(getStripe()).toBeDefined();
  });
});
