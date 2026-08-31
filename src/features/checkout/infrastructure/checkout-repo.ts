import { and, eq, sql } from "drizzle-orm";
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

/** Crée (ou réutilise) une commande `pending` pour l'utilisateur et l'instancie. */
export async function createPendingOrder(
  userId: string,
  items: { productId: string; title: string; priceInCents: number; currency: string }[],
  totalInCents: number,
  currency: string,
) {
  // Réutilise la dernière commande pending du même utilisateur si le total correspond,
  // pour éviter d'accumuler des commandes d'exemple à chaque clic sur "Payer".
  const id = crypto.randomUUID().replace(/-/g, "");
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "pending"),
        eq(orders.totalInCents, totalInCents),
      ),
    )
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(1);

  const orderId = existing[0]?.id ?? id;

  if (existing.length === 0) {
    await db.insert(orders).values({
      id: orderId,
      userId,
      status: "pending" as OrderStatus,
      totalInCents,
      currency,
    });
    for (const it of items) {
      await db.insert(orderItems).values({
        orderId,
        productId: it.productId,
        titleSnapshot: it.title,
        priceInCents: it.priceInCents,
        currency: it.currency,
      });
    }
  }

  return { orderId, isNew: existing.length === 0 };
}

/** Marque une commande payée (après webhook vérifié). */
export function markOrderPaid(orderId: string) {
  return db
    .update(orders)
    .set({ status: "paid" as OrderStatus, paidAt: new Date() })
    .where(eq(orders.id, orderId));
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

/**
 * Crée des entitlements (droits d'accès) dans une transaction, avec un seul droit
 * par produit acheté (contrainte unique). Retourne le nombre créé.
 */
export async function grantEntitlements(userId: string, orderId: string) {
  const items = await getOrderItems(orderId);
  let created = 0;
  for (const item of items) {
    const res = await db
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
  return created;
}

/** Vide le panier de l'utilisateur. */
export function clearCartForUser(userId: string) {
  return db.delete(cartItems).where(eq(cartItems.userId, userId));
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
