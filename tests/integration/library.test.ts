import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { user, entitlements, products, orders } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { viewLibrary, createDownloadLink } from "@/features/library/application/library-service";

/**
 * Tests d'intégration de la bibliothèque contre la base réelle.
 * Nécessite DATABASE_URL + migrations + seed:products.
 */
const runtime = process.env as Record<string, string>;

describe("Bibliothèque (intégration)", () => {
  const email = `it-lib-${Date.now()}@biblio.test`;
  const otherEmail = `it-lib-o-${Date.now()}@biblio.test`;
  let buyerId = "";
  let otherId = "";
  let productId = "";

  beforeAll(async () => {
    if (!runtime.DATABASE_URL) throw new Error("DATABASE_URL manquant.");
    const [buyer] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Lib Buyer", email, role: "customer" })
      .returning({ id: user.id });
    buyerId = buyer.id;

    const [other] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Other", email: otherEmail, role: "customer" })
      .returning({ id: user.id });
    otherId = other.id;

    const [p] = await db.select().from(products).where(eq(products.published, true)).limit(1);
    productId = p.id;

    // Une commande payée pour satisfaire la FK `order_id`.
    const orderId = "it-lib-order-" + Date.now();
    await db.insert(orders).values({
      id: orderId,
      userId: buyerId,
      status: "paid",
      totalInCents: 0,
      currency: "eur",
      paidAt: new Date(),
    });

    // accorde un entitlement d'achat au buyer
    await db.insert(entitlements).values({
      id: randomUUID(),
      userId: buyerId,
      productId,
      orderId,
    });
  });

  afterAll(async () => {
    await db.delete(entitlements).where(eq(entitlements.userId, buyerId));
    await db.delete(entitlements).where(eq(entitlements.userId, otherId));
    await db.delete(orders).where(eq(orders.userId, buyerId));
    await db.delete(user).where(eq(user.email, email));
    await db.delete(user).where(eq(user.email, otherEmail));
  });

  it("liste les ouvrages pour lesquels l'utilisateur a un droit d'accès", async () => {
    const items = await viewLibrary(buyerId);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.productId === productId)).toBe(true);
    expect(items[0].purchasedAt).toBeInstanceOf(Date);
  });

  it("refuse le téléchargement à un utilisateur SANS droit (403)", async () => {
    const res = await createDownloadLink(otherId, productId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_ENTITLED");
  });

  it("refuse le téléchargement si le fichier n'existe pas (fiche sans fileUrl)", async () => {
    const res = await createDownloadLink(buyerId, productId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FILE_NOT_AVAILABLE");
  });
});
