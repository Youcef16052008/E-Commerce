import { afterEach, describe, expect, it } from "vitest";
import {
  isExhausted,
  isMailableRecipient,
  isOutboxKind,
  nextRunAfter,
} from "@/features/outbox/domain/outbox-types";
import { isCronAuthorized } from "@/features/outbox/application/outbox-service";

/** Règles pures de l'outbox (L6.1 / D-11). */

describe("backoff", () => {
  const now = new Date("2026-09-26T00:00:00Z");
  it("1 min, 2, 4, 8 … plafonné à 6 h", () => {
    expect(nextRunAfter(1, now).getTime() - now.getTime()).toBe(60_000);
    expect(nextRunAfter(2, now).getTime() - now.getTime()).toBe(2 * 60_000);
    expect(nextRunAfter(4, now).getTime() - now.getTime()).toBe(8 * 60_000);
    expect(nextRunAfter(20, now).getTime() - now.getTime()).toBe(360 * 60_000);
  });
  it("isExhausted à maxAttempts", () => {
    expect(isExhausted(4, 5)).toBe(false);
    expect(isExhausted(5, 5)).toBe(true);
  });
});

describe("garde-fous", () => {
  it("isOutboxKind", () => {
    expect(isOutboxKind("send_receipts")).toBe(true);
    expect(isOutboxKind("drop_tables")).toBe(false);
  });
  it("les comptes anonymisés ne sont pas contactables", () => {
    expect(isMailableRecipient("a@b.test")).toBe(true);
    expect(isMailableRecipient("deleted-x@anonymised.invalid")).toBe(false);
    expect(isMailableRecipient("-")).toBe(false);
  });
});

describe("isCronAuthorized", () => {
  const saved = process.env.CRON_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });
  it("refuse sans secret ou secret trop court", () => {
    expect(isCronAuthorized("Bearer x", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
  it("exige exactement `Bearer <secret>`", () => {
    const s = "0123456789abcdef0123";
    expect(isCronAuthorized(`Bearer ${s}`, s)).toBe(true);
    expect(isCronAuthorized(s, s)).toBe(false);
    expect(isCronAuthorized(`Bearer ${s}x`, s)).toBe(false);
    expect(isCronAuthorized(null, s)).toBe(false);
  });
});
