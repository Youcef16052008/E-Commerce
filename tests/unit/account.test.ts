import { describe, expect, it } from "vitest";
import {
  ANONYMISED_NAME,
  DELETE_CONFIRMATION_PHRASE,
  anonymisedEmail,
  assessDeletion,
  isDeleteConfirmed,
} from "@/features/account/domain/account-types";
import { shapeExport } from "@/features/account/application/account-service";

/** Règles pures du module « compte » (L5.2 / D-06). */

describe("assessDeletion", () => {
  it("aucune commande → suppression physique", () => {
    expect(assessDeletion([])).toEqual({ mode: "hard" });
  });

  it("commandes soldées (paid/fulfilled/failed/refunded) → anonymisation", () => {
    expect(
      assessDeletion([
        { status: "fulfilled" },
        { status: "failed" },
        { status: "refunded" },
        { status: "paid" },
      ]),
    ).toEqual({ mode: "anonymise", retainedOrders: 4 });
  });

  it.each(["pending", "refund_pending"] as const)("%s en cours → bloqué", (status) => {
    expect(assessDeletion([{ status: "fulfilled" }, { status }])).toEqual({
      mode: "blocked",
      reason: "order_in_flight",
      inFlight: 1,
    });
  });
});

describe("confirmation & anonymisation", () => {
  it("isDeleteConfirmed exige exactement la phrase", () => {
    expect(isDeleteConfirmed({ confirm: DELETE_CONFIRMATION_PHRASE })).toBe(true);
    expect(isDeleteConfirmed({ confirm: "supprimer" })).toBe(false);
    expect(isDeleteConfirmed({})).toBe(false);
    expect(isDeleteConfirmed(null)).toBe(false);
    expect(isDeleteConfirmed("SUPPRIMER")).toBe(false);
  });

  it("anonymisedEmail est unique par id et non routable", () => {
    expect(anonymisedEmail("abc")).toBe("deleted-abc@anonymised.invalid");
    expect(anonymisedEmail("a")).not.toBe(anonymisedEmail("b"));
    expect(ANONYMISED_NAME).toBe("Compte supprimé");
  });
});

describe("shapeExport", () => {
  const d = new Date("2026-09-26T08:00:00Z");
  const data = {
    profile: { id: "u1", email: "a@b.test", name: "Ada", role: "customer", createdAt: d },
    cart: [{ productId: "p3", title: "Candide", addedAt: d }],
    orders: [
      {
        id: "o1",
        status: "fulfilled" as const,
        totalInCents: 50,
        currency: "usd",
        createdAt: d,
        paidAt: d,
      },
      {
        id: "o2",
        status: "failed" as const,
        totalInCents: 50,
        currency: "usd",
        createdAt: d,
        paidAt: null,
      },
    ],
    items: [
      { orderId: "o1", productId: "p1", title: "Les Misérables", priceInCents: 50, quantity: 1 },
      { orderId: "o2", productId: "p2", title: "Germinal", priceInCents: 50, quantity: 1 },
    ],
    entitlements: [{ productId: "p1", title: "Les Misérables", orderId: "o1", grantedAt: d }],
    refunds: [],
    sessions: [{ createdAt: d, expiresAt: d, userAgent: "vitest" }],
  };

  it("produit un document versionné, dates ISO, articles regroupés par commande", () => {
    const out = shapeExport(data, d);
    expect(out.format).toBe("biblio-account-export");
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe("2026-09-26T08:00:00.000Z");
    expect(out.profile).toEqual({
      id: "u1",
      email: "a@b.test",
      name: "Ada",
      role: "customer",
      createdAt: "2026-09-26T08:00:00.000Z",
    });
    expect(out.orders[0]!.items).toEqual([
      { productId: "p1", title: "Les Misérables", priceInCents: 50, quantity: 1 },
    ]);
    expect(out.orders[1]!.paidAt).toBeNull();
    expect(out.orders[1]!.items[0]!.title).toBe("Germinal");
    expect(out.entitlements).toHaveLength(1);
    expect(out.sessions[0]!.userAgent).toBe("vitest");
    expect(out.notes.some((n) => /mots de passe/.test(n))).toBe(true);
  });

  it("n'expose ni mot de passe ni IP", () => {
    const json = JSON.stringify(shapeExport(data, d));
    expect(json).not.toMatch(/password|ipAddress/);
  });
});
