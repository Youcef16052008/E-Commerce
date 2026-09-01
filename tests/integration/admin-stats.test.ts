import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products } from "@/server/db/schema";
import { viewAdminStats } from "@/features/admin/application/admin-stats-service";
import type { AdminStats } from "@/features/admin/domain/admin-stats-types";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration stats admin (Slice 8) contre une base réelle.
 *
 * Méthode en écarts (before/after) : la base contient déjà des données
 * (seeds, autres suites), on vérifie que les agrégats augmentent
 * EXACTEMENT du delta attendu — ce qui valide aussi que pending/failed/
 * refunded sont exclus du revenu.
 *
 * Données créées :
 * - 1 client (role customer)
 * - 2 produits (1 publié, 1 brouillon)
 * - 5 commandes : pending 100¢, paid 200¢, fulfilled 300¢ (2 unités),
 *   failed 400¢, refunded 500¢
 *
 * Attentes : revenu +500¢ (paid + fulfilled uniquement),
 * paidOrdersCount +2, top produit = le produit à 2 unités.
 */

const runId = Date.now();

describe.skipIf(!hasDatabase)("Stats admin (intégration)", () => {
  const customerEmail = `it-stats-c-${runId}@biblio.test`;
  let customerId = "";
  let publishedProductId = "";
  let draftProductId = "";
  let paidOrderId = "";
  let fulfilledOrderId = "";
  const orderIds: string[] = [];
  const productIds: string[] = [];

  let baseline: AdminStats;

  async function insertOrder(
    status: "pending" | "paid" | "fulfilled" | "failed" | "refunded",
    totalInCents: number,
    createdAt: Date,
  ) {
    const id = randomUUID();
    orderIds.push(id);
    if (status === "paid") paidOrderId = id;
    if (status === "fulfilled") fulfilledOrderId = id;
    await db.insert(orders).values({
      id,
      userId: customerId,
      status,
      totalInCents,
      currency: "usd",
      createdAt,
      paidAt: status === "paid" || status === "fulfilled" ? createdAt : null,
    });
    return id;
  }

  beforeAll(async () => {
    // Baseline AVANT insertion (méthode en écarts).
    baseline = await viewAdminStats();

    // 1 client
    const [c] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Stats Customer", email: customerEmail, role: "customer" })
      .returning({ id: user.id });
    customerId = c.id;

    // 2 produits (1 publié, 1 brouillon)
    const [pub] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-stats-pub-${runId}`,
        title: `IT Stats Publié ${runId}`,
        author: "Auteur Stats",
        format: "epub",
        priceInCents: 100,
        currency: "usd",
        published: true,
      })
      .returning({ id: products.id });
    const [draft] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-stats-draft-${runId}`,
        title: `IT Stats Brouillon ${runId}`,
        author: "Auteur Stats",
        format: "epub",
        priceInCents: 100,
        currency: "usd",
        published: false,
      })
      .returning({ id: products.id });
    publishedProductId = pub.id;
    draftProductId = draft.id;
    productIds.push(publishedProductId, draftProductId);

    // 5 commandes, dates explicites (ordonnancement stable pour recentOrders).
    // La commande fulfilled porte une date LÉGÈREMENT FUTURE (+5 min) : la base
    // est partagée entre les fichiers de test (vitest parallèle) et d'autres
    // suites créent des commandes `now` — la date future garantit que la
    // nôtre est en tête de `recentOrders` (aucune autre suite n'utilise de
    // date future, et la durée d'une suite est < 5 min).
    const now = new Date();
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);

    await insertOrder("pending", 100, at(5));
    await insertOrder("paid", 200, at(4));
    const fulfilledId = await insertOrder("fulfilled", 300, new Date(now.getTime() + 5 * 60_000));
    await insertOrder("failed", 400, at(3));
    await insertOrder("refunded", 500, at(2));

    // Lignes de commande : la commande fulfilled porte 2 unités du produit publié
    // (→ 2 unités vendues pour ce produit ; les autres 1 unité du brouillon).
    const items: { orderId: string; productId: string; title: string; quantity: number }[] = [
      {
        orderId: orderIds[0],
        productId: draftProductId,
        title: `IT Stats Brouillon ${runId}`,
        quantity: 1,
      },
      {
        orderId: paidOrderId,
        productId: draftProductId,
        title: `IT Stats Brouillon ${runId}`,
        quantity: 1,
      },
      {
        orderId: fulfilledId,
        productId: publishedProductId,
        title: `IT Stats Publié ${runId}`,
        quantity: 2,
      },
      {
        orderId: orderIds[3],
        productId: draftProductId,
        title: `IT Stats Brouillon ${runId}`,
        quantity: 1,
      },
      {
        orderId: orderIds[4],
        productId: draftProductId,
        title: `IT Stats Brouillon ${runId}`,
        quantity: 1,
      },
    ];
    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: item.orderId,
        productId: item.productId,
        titleSnapshot: item.title,
        priceInCents: 100,
        quantity: item.quantity,
        currency: "usd",
      });
    }
  });

  afterAll(async () => {
    if (orderIds.length > 0) {
      await db
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .catch(() => undefined);
      await db
        .delete(orders)
        .where(inArray(orders.id, orderIds))
        .catch(() => undefined);
    }
    for (const id of productIds) {
      await db
        .delete(products)
        .where(eq(products.id, id))
        .catch(() => undefined);
    }
    if (customerId) {
      await db
        .delete(user)
        .where(eq(user.id, customerId))
        .catch(() => undefined);
    }
  });

  it("produits : total + publiés + brouillons augmentent exactement du delta", async () => {
    const stats = await viewAdminStats();
    expect(stats.productsTotal).toBe(baseline.productsTotal + 2);
    expect(stats.productsPublished).toBe(baseline.productsPublished + 1);
    expect(stats.productsDraft).toBe(baseline.productsDraft + 1);
    expect(stats.productsPublished + stats.productsDraft).toBe(stats.productsTotal);
  });

  it("commandes : total +1 par statut pour les 5 statuts créés", async () => {
    const stats = await viewAdminStats();
    expect(stats.ordersTotal).toBe(baseline.ordersTotal + 5);
    expect(stats.ordersByStatus).toEqual({
      pending: baseline.ordersByStatus.pending + 1,
      paid: baseline.ordersByStatus.paid + 1,
      fulfilled: baseline.ordersByStatus.fulfilled + 1,
      failed: baseline.ordersByStatus.failed + 1,
      refunded: baseline.ordersByStatus.refunded + 1,
    });
    // La somme de la répartition est cohérente avec le total.
    const sum = Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.ordersTotal);
  });

  it("revenu : paid + fulfilled UNIQUEMENT (pending/failed/refunded exclus)", async () => {
    const stats = await viewAdminStats();
    // 200¢ (paid) + 300¢ (fulfilled) = 500¢ — jamais 100+400+500.
    expect(stats.revenueInCents).toBe(baseline.revenueInCents + 500);
    expect(stats.paidOrdersCount).toBe(baseline.paidOrdersCount + 2);
    expect(stats.currency).toBe("usd");
    expect(Number.isInteger(stats.revenueInCents)).toBe(true);
  });

  it("clients : +1 (role customer uniquement)", async () => {
    const stats = await viewAdminStats();
    expect(stats.customersTotal).toBe(baseline.customersTotal + 1);
  });

  it("dernières commandes : la plus récente (fulfilled) est en tête, avec client + libellé FR", async () => {
    const stats = await viewAdminStats();
    const latest = stats.recentOrders[0];
    expect(latest).toBeDefined();
    expect(latest.id).toBe(fulfilledOrderId);
    expect(latest.userEmail).toBe(customerEmail);
    expect(latest.userName).toBe("Stats Customer");
    expect(latest.statusLabel).toBe("Livrée");
    expect(latest.totalFormatted).toContain("3.00"); // 300¢ USD
    expect(stats.recentOrders.length).toBeLessThanOrEqual(5);
  });

  it("top produits : 2 unités vendues pour le produit de la commande fulfilled", async () => {
    const stats = await viewAdminStats();
    expect(stats.topProducts.length).toBeLessThanOrEqual(5);
    const top = stats.topProducts.find((p) => p.productId === publishedProductId);
    expect(top).toBeDefined();
    expect(top!.title).toBe(`IT Stats Publié ${runId}`);
    expect(top!.unitsSold).toBe(2);
    // Le brouillon (4 × 1 unité via paid + 3 commandes non payées) compte 1 unité.
    const draft = stats.topProducts.find((p) => p.productId === draftProductId);
    expect(draft).toBeDefined();
    expect(draft!.unitsSold).toBe(1);
  });

  it("statuts FR : libellés présents pour les 5 statuts", async () => {
    const stats = await viewAdminStats();
    expect(stats.ordersByStatusLabel).toEqual({
      pending: "En attente de paiement",
      paid: "Payée",
      fulfilled: "Livrée",
      failed: "Échec du paiement",
      refunded: "Remboursée",
    });
  });
});
