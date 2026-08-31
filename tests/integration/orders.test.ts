import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products } from "@/server/db/schema";
import { viewOrders } from "@/features/orders/application/order-service";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration de l'historique des commandes contre une base réelle.
 * Nécessite DATABASE_URL + migrations.
 * - Liste les commandes de l'utilisateur avec leurs articles (quantité incluse).
 * - N'expose jamais les commandes d'un autre utilisateur.
 */

const runId = Date.now();

describe.skipIf(!hasDatabase)("Commandes (intégration)", () => {
  const email = `it-orders-${runId}@biblio.test`;
  const otherEmail = `it-orders-o-${runId}@biblio.test`;
  let userId = "";
  let otherId = "";
  let productId = "";
  let orderId = "";

  beforeAll(async () => {
    const [u] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Orders IT", email, role: "customer" })
      .returning({ id: user.id });
    userId = u.id;

    const [o] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Other Orders", email: otherEmail, role: "customer" })
      .returning({ id: user.id });
    otherId = o.id;

    const [p] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-orders-${runId}`,
        title: "Produit commande IT",
        author: "Tests",
        format: "epub",
        priceInCents: 250,
        currency: "usd",
        published: true,
      })
      .returning({ id: products.id });
    productId = p.id;

    orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId,
      status: "paid",
      totalInCents: 500,
      currency: "usd",
      paidAt: new Date(),
    });
    await db.insert(orderItems).values({
      orderId,
      productId,
      titleSnapshot: "Produit commande IT",
      priceInCents: 250,
      quantity: 2,
      currency: "usd",
    });
  });

  afterAll(async () => {
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(user).where(eq(user.email, email));
    await db.delete(user).where(eq(user.email, otherEmail));
  });

  it("liste les commandes de l'utilisateur avec articles, quantité et total", async () => {
    const list = await viewOrders(userId);
    expect(list).toHaveLength(1);
    const order = list[0];
    expect(order.id).toBe(orderId);
    expect(order.status).toBe("paid");
    expect(order.statusLabel).toBe("Payée");
    expect(order.totalInCents).toBe(500);
    expect(order.currency).toBe("usd");
    expect(order.itemCount).toBe(2);
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].title).toBe("Produit commande IT");
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].priceInCents).toBe(250);
    expect(order.items[0].lineTotalInCents).toBe(500);
  });

  it("n'expose PAS les commandes d'un autre utilisateur", async () => {
    const otherList = await viewOrders(otherId);
    expect(otherList).toHaveLength(0);
  });
});
