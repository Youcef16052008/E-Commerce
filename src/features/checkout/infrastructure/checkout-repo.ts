import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  orders,
  orderItems,
  entitlements,
  cartItems,
  stripeEvents,
  products,
} from "@/server/db/schema";
import type { OrderStatus } from "../domain/checkout-types";

/**
 * Dépôt du checkout (ordres, items, entitlements) et de l'idempotence des webhooks.
 */

/**
 * Crée une NOUVELLE commande `pending` et ses items dans une transaction, et
 * supprime au passage les anciennes commandes `pending` de l'utilisateur
 * (checkouts abandonnés).
 *
 * (Registre H-2) L'ancienne version « réutilisait » la dernière commande pending
 * au total égal : un nouveau checkout pouvait alors hériter de l'orderId d'une
 * commande antérieure — payer le panier B pouvait délivrer les items de A.
 * Désormais chaque checkout = une commande propre, sans accumulation.
 */
export async function createPendingOrder(
  userId: string,
  items: {
    productId: string;
    title: string;
    priceInCents: number;
    quantity: number;
    currency: string;
  }[],
  totalInCents: number,
  currency: string,
): Promise<{ orderId: string }> {
  const orderId = crypto.randomUUID().replace(/-/g, "");

  await db.transaction(async (tx) => {
    // Nettoyage des checkouts abandonnés (leurs items tombent en cascade).
    await tx.delete(orders).where(and(eq(orders.userId, userId), eq(orders.status, "pending")));

    await tx.insert(orders).values({
      id: orderId,
      userId,
      status: "pending" as OrderStatus,
      totalInCents,
      currency,
    });
    for (const it of items) {
      await tx.insert(orderItems).values({
        orderId,
        productId: it.productId,
        titleSnapshot: it.title,
        priceInCents: it.priceInCents,
        quantity: it.quantity,
        currency: it.currency,
      });
    }
  });

  return { orderId };
}

/** Enregistre un évènement Stripe de façon idempotente (retourne false si déjà traité). */
export async function recordStripeEvent(eventId: string, type: string): Promise<boolean> {
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: crypto.randomUUID().replace(/-/g, ""), stripeEventId: eventId, type })
    .onConflictDoNothing({ target: stripeEvents.stripeEventId })
    .returning({ id: stripeEvents.id });
  return inserted.length > 0;
}

/** Renvoie les items d'une commande (snapshot des produits). */
export function getOrderItems(orderId: string) {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

/** Commande + total, avec vérification que l'ID user correspond (anti-falsification). */
export async function getOrderForWebhook(
  orderId: string,
  userId: string,
): Promise<{ id: string; totalInCents: number } | null> {
  const rows = await db
    .select({ id: orders.id, totalInCents: orders.totalInCents })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fulfille une commande payée ATOMIQUEMENT (registre H-4) :
 *   1. commande → `paid` (uniquement si elle est `pending` ou `failed`),
 *   2. entitlements accordés (un droit par produit acheté, unique (user, produit)),
 *   3. panier de l'utilisateur vidé.
 * Tout se passe dans UNE transaction : en cas d'erreur, rien n'est commité
 * (jamais de commande marquée payée sans ses droits, ni état partiel).
 *
 * Retourne le nombre d'entitlements créés, ou `null` si la commande n'est pas
 * éligible (déjà payée/fulfilled/refundée) — garde d'idempotence.
 */
export async function fulfillPaidOrder(userId: string, orderId: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: "paid" as OrderStatus, paidAt: new Date() })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["pending", "failed"])))
      .returning({ id: orders.id });
    if (updated.length === 0) {
      return null;
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let created = 0;
    for (const item of items) {
      const res = await tx
        .insert(entitlements)
        .values({
          id: crypto.randomUUID().replace(/-/g, ""),
          userId,
          productId: item.productId,
          orderId,
        })
        .onConflictDoNothing({ target: [entitlements.userId, entitlements.productId] })
        .returning({ id: entitlements.id });
      created += res.length;
    }

    await tx.delete(cartItems).where(eq(cartItems.userId, userId));
    return created;
  });
}

/**
 * Marque une commande `failed` (événement `async_payment_failed`) : uniquement si
 * encore `pending` — ne remplace jamais `paid`/`fulfilled`/`refunded`.
 */
export async function markOrderFailed(orderId: string): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ status: "failed" as OrderStatus })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id });
  return updated.length > 0;
}

/** Récupère les produits publiés (source de vérité du prix) du panier. */
export async function getCartForCheckout(userId: string) {
  const rows = await db
    .select({
      productId: products.id,
      title: products.title,
      quantity: cartItems.quantity,
      priceInCents: products.priceInCents,
      currency: products.currency,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.userId, userId), eq(products.published, true)));
  return rows;
}
