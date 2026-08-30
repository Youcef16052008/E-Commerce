import { describe, it, expect } from "vitest";
import { products, orders, entitlements, stripeEvents } from "@/server/db/schema";

describe("schéma de données Biblio", () => {
  it("expose les tables de domaine attendues", () => {
    expect(products).toBeDefined();
    expect(orders).toBeDefined();
    expect(entitlements).toBeDefined();
    expect(stripeEvents).toBeDefined();
  });

  it("les montants sont en centimes (entiers)", () => {
    // Une colonne entière PG a pour type `number` côté Drizzle (jamais float).
    expect(products.priceInCents.dataType).toBe("number");
    expect(products.currency.dataType).toBe("string");
  });
});
