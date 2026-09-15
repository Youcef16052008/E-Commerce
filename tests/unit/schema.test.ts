import { describe, it, expect } from "vitest";
import {
  cartItems,
  products,
  orders,
  entitlements,
  refunds,
  stripeEvents,
  stripeSyncLog,
} from "@/server/db/schema";

describe("schéma de données Biblio", () => {
  it("expose les tables de domaine attendues", () => {
    expect(products).toBeDefined();
    expect(cartItems).toBeDefined();
    expect(orders).toBeDefined();
    expect(entitlements).toBeDefined();
    expect(refunds).toBeDefined();
    expect(stripeEvents).toBeDefined();
    expect(stripeSyncLog).toBeDefined();
  });

  it("persists the identifiers needed to reconcile a Checkout intent", () => {
    expect(orders.checkoutKey.dataType).toBe("string");
    expect(orders.stripeCheckoutSessionId.dataType).toBe("string");
    expect(orders.stripePaymentIntentId.dataType).toBe("string");
    expect(orders.checkoutExpiresAt.dataType).toBe("date");
  });

  it("les montants sont en centimes (entiers)", () => {
    // Une colonne entière PG a pour type `number` côté Drizzle (jamais float).
    expect(products.priceInCents.dataType).toBe("number");
    expect(products.currency.dataType).toBe("string");
  });
});
