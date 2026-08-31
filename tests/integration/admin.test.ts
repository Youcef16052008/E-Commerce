import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products } from "@/server/db/schema";
import {
  createAdminProduct,
  queryAdminProducts,
  updateAdminProduct,
  removeAdminProduct,
  getAdminProduct,
} from "@/features/admin/application/admin-product-service";
import { viewAllOrders, updateOrderStatus } from "@/features/admin/application/admin-order-service";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration admin contre une base réelle.
 * CRUD produits, unicité slug, refus de suppression référencée, commandes.
 */

const runId = Date.now();

describe.skipIf(!hasDatabase)("Admin (intégration)", () => {
  const customerEmail = `it-admin-c-${runId}@biblio.test`;
  let customerId = "";
  let createdProductId = "";
  let referencedProductId = "";
  let orderId = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    const [c] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Admin IT Customer",
        email: customerEmail,
        role: "customer",
      })
      .returning({ id: user.id });
    customerId = c.id;
  });

  afterAll(async () => {
    if (orderId) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
    for (const id of createdIds) {
      await db
        .delete(products)
        .where(eq(products.id, id))
        .catch(() => undefined);
    }
    if (referencedProductId) {
      await db
        .delete(products)
        .where(eq(products.id, referencedProductId))
        .catch(() => undefined);
    }
    if (createdProductId) {
      await db
        .delete(products)
        .where(eq(products.id, createdProductId))
        .catch(() => undefined);
    }
    await db.delete(user).where(eq(user.email, customerEmail));
  });

  it("CRUD produit complet : create → list → update → delete", async () => {
    const created = await createAdminProduct({
      title: `IT Admin Livre ${runId}`,
      author: "Auteur Test",
      format: "epub",
      priceInCents: 99,
      currency: "usd",
      published: false,
      description: "Desc IT",
      genre: "Essais",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductId = created.product.id;
    createdIds.push(createdProductId);

    expect(created.product.slug).toMatch(/^it-admin-livre/);
    expect(created.product.published).toBe(false);
    expect(created.product.priceInCents).toBe(99);

    const listed = await queryAdminProducts({ q: `IT Admin Livre ${runId}`, status: "draft" });
    expect(listed.items.some((p) => p.id === createdProductId)).toBe(true);

    const updated = await updateAdminProduct(createdProductId, {
      published: true,
      title: `IT Admin Livre ${runId} v2`,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.product.published).toBe(true);
    expect(updated.product.title).toContain("v2");

    const got = await getAdminProduct(createdProductId);
    expect(got?.published).toBe(true);

    const removed = await removeAdminProduct(createdProductId);
    expect(removed.ok).toBe(true);
    expect(await getAdminProduct(createdProductId)).toBeNull();
    createdProductId = "";
  });

  it("refuse un slug dupliqué (409 SLUG_TAKEN)", async () => {
    const slug = `it-admin-slug-${runId}`;
    const first = await createAdminProduct({
      title: "Premier",
      author: "A",
      format: "epub",
      priceInCents: 10,
      currency: "usd",
      published: false,
      slug,
    });
    expect(first.ok).toBe(true);
    if (first.ok) createdIds.push(first.product.id);

    const second = await createAdminProduct({
      title: "Second",
      author: "B",
      format: "pdf",
      priceInCents: 20,
      currency: "usd",
      published: false,
      slug,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("SLUG_TAKEN");
      expect(second.error.status).toBe(409);
    }
  });

  it("refuse de supprimer un produit référencé par order_items (409)", async () => {
    const prod = await createAdminProduct({
      title: `IT Ref ${runId}`,
      author: "Ref",
      format: "epub",
      priceInCents: 50,
      currency: "usd",
      published: true,
    });
    expect(prod.ok).toBe(true);
    if (!prod.ok) return;
    referencedProductId = prod.product.id;
    createdIds.push(referencedProductId);

    orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: customerId,
      status: "paid",
      totalInCents: 50,
      currency: "usd",
      paidAt: new Date(),
    });
    await db.insert(orderItems).values({
      orderId,
      productId: referencedProductId,
      titleSnapshot: `IT Ref ${runId}`,
      priceInCents: 50,
      quantity: 1,
      currency: "usd",
    });

    const removed = await removeAdminProduct(referencedProductId);
    expect(removed.ok).toBe(false);
    if (!removed.ok) {
      expect(removed.error.code).toBe("PRODUCT_REFERENCED");
      expect(removed.error.status).toBe(409);
    }
    // Toujours présent
    expect(await getAdminProduct(referencedProductId)).not.toBeNull();
  });

  it("liste les commandes avec email client et change le statut", async () => {
    // orderId créé dans le test précédent
    expect(orderId).toBeTruthy();

    const list = await viewAllOrders();
    const found = list.find((o) => o.id === orderId);
    expect(found).toBeDefined();
    expect(found!.userEmail).toBe(customerEmail);
    expect(found!.userName).toBe("Admin IT Customer");
    expect(found!.status).toBe("paid");
    expect(found!.statusLabel).toBe("Payée");
    expect(found!.items.length).toBeGreaterThanOrEqual(1);

    const updated = await updateOrderStatus(orderId, { status: "fulfilled" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.order.status).toBe("fulfilled");

    const list2 = await viewAllOrders();
    const again = list2.find((o) => o.id === orderId);
    expect(again?.status).toBe("fulfilled");
    expect(again?.statusLabel).toBe("Livrée");
  });

  it("renvoie 404 pour un id de commande inconnu", async () => {
    const result = await updateOrderStatus(randomUUID(), { status: "paid" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.status).toBe(404);
    }
  });

  it("renvoie 404 pour un produit inconnu (update/delete)", async () => {
    const id = randomUUID();
    const u = await updateAdminProduct(id, { title: "x" });
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.error.status).toBe(404);

    const d = await removeAdminProduct(id);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.status).toBe(404);
  });
});
