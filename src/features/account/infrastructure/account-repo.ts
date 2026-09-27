import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  account,
  cartItems,
  entitlements,
  orderItems,
  orders,
  products,
  refunds,
  session,
  user,
} from "@/server/db/schema";
import { ANONYMISED_NAME, anonymisedEmail } from "../domain/account-types";

/** Lecture brute de tout ce qui concerne un utilisateur (pour l'export). */
export async function readUserData(userId: string) {
  const [profile] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!profile) return null;

  const [cart, userOrders, items, userEntitlements, userRefunds, userSessions] = await Promise.all([
    db
      .select({
        productId: cartItems.productId,
        title: products.title,
        addedAt: cartItems.createdAt,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.userId, userId)),
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(orders.createdAt),
    db
      .select({
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        title: orderItems.titleSnapshot,
        priceInCents: orderItems.priceInCents,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orders.userId, userId)),
    db
      .select({
        productId: entitlements.productId,
        title: products.title,
        orderId: entitlements.orderId,
        grantedAt: entitlements.createdAt,
      })
      .from(entitlements)
      .innerJoin(products, eq(products.id, entitlements.productId))
      .where(eq(entitlements.userId, userId)),
    db
      .select({
        orderId: refunds.orderId,
        status: refunds.status,
        amountInCents: refunds.amountInCents,
        currency: refunds.currency,
        createdAt: refunds.createdAt,
        completedAt: refunds.completedAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(eq(orders.userId, userId)),
    db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId)),
  ]);

  return {
    profile,
    cart,
    orders: userOrders,
    items,
    entitlements: userEntitlements,
    refunds: userRefunds,
    sessions: userSessions,
  };
}

export async function listOrderStatuses(userId: string) {
  return db.select({ status: orders.status }).from(orders).where(eq(orders.userId, userId));
}

/** Suppression physique : les FK `cascade` (session, account, cart, entitlements) suivent. */
export async function hardDeleteUser(userId: string): Promise<void> {
  await db.delete(user).where(eq(user.id, userId));
}

/**
 * Anonymisation transactionnelle : identité effacée, accès révoqués, commandes
 * conservées (pièces comptables) rattachées à un identifiant technique.
 */
export async function anonymiseUser(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.delete(cartItems).where(eq(cartItems.userId, userId));
    await tx.delete(entitlements).where(eq(entitlements.userId, userId));
    await tx
      .update(user)
      .set({
        email: anonymisedEmail(userId),
        name: ANONYMISED_NAME,
        emailVerified: false,
        image: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  });
}
