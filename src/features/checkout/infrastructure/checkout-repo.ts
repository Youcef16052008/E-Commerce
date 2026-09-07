import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  cartItems,
  entitlements,
  orderItems,
  orders,
  products,
  stripeEvents,
} from "@/server/db/schema";

export type CheckoutItem = {
  productId: string;
  title: string;
  priceInCents: number;
  currency: string;
  quantity: number;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PendingCheckoutOrder = {
  id: string;
  status: "pending" | "paid" | "fulfilled" | "failed" | "refunded";
  stripeCheckoutSessionId: string | null;
  checkoutExpiresAt: Date | null;
  created: boolean;
};

export type FulfillmentResult =
  | { kind: "fulfilled"; orderId: string }
  | { kind: "already-fulfilled"; orderId: string }
  | { kind: "duplicate-event" };

function newId() {
  return crypto.randomUUID();
}

/**
 * Relit le panier et les produits publiés au moment précis du checkout. Les
 * prix et la devise ne viennent jamais du navigateur.
 */
export async function getCartForCheckout(userId: string): Promise<CheckoutItem[]> {
  return db
    .select({
      productId: products.id,
      title: products.title,
      priceInCents: products.priceInCents,
      currency: products.currency,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.userId, userId), eq(products.published, true)));
}

/** Product IDs already licensed to this customer. */
export async function getEntitledProductIds(userId: string, productIds: string[]) {
  if (productIds.length === 0) return [];

  const rows = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), inArray(entitlements.productId, productIds)));

  return rows.map((row) => row.productId);
}

async function insertOrderItems(tx: Transaction, orderId: string, items: CheckoutItem[]) {
  await tx.insert(orderItems).values(
    items.map((item) => ({
      orderId,
      productId: item.productId,
      titleSnapshot: item.title,
      priceInCents: item.priceInCents,
      quantity: item.quantity,
      currency: item.currency,
    })),
  );
}

/**
 * Inserts a pending order only once for a deterministic checkout fingerprint.
 * `orders.checkout_key` is unique, so a double click or two browser tabs cannot
 * create two independently payable orders for the same basket.
 */
export async function createOrReusePendingOrder(input: {
  userId: string;
  items: CheckoutItem[];
  totalInCents: number;
  currency: string;
  checkoutKey: string;
}): Promise<PendingCheckoutOrder> {
  return db.transaction(async (tx) => {
    const id = newId();
    const inserted = await tx
      .insert(orders)
      .values({
        id,
        userId: input.userId,
        totalInCents: input.totalInCents,
        currency: input.currency,
        status: "pending",
        checkoutKey: input.checkoutKey,
      })
      .onConflictDoNothing({ target: orders.checkoutKey })
      .returning({
        id: orders.id,
        status: orders.status,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        checkoutExpiresAt: orders.checkoutExpiresAt,
      });

    if (inserted[0]) {
      await insertOrderItems(tx, id, input.items);
      return { ...inserted[0], created: true };
    }

    // Under PostgreSQL's default READ COMMITTED isolation this statement sees
    // the row that won the unique-key race after ON CONFLICT has returned.
    const existing = await tx
      .select({
        id: orders.id,
        status: orders.status,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        checkoutExpiresAt: orders.checkoutExpiresAt,
      })
      .from(orders)
      .where(eq(orders.checkoutKey, input.checkoutKey))
      .limit(1);

    if (!existing[0]) {
      throw new Error("Checkout order could not be created or reloaded");
    }

    return { ...existing[0], created: false };
  });
}

/**
 * Compatibility helper for internal tests that create an order without an
 * online Checkout intent. It deliberately never deletes another pending order.
 */
export async function createPendingOrder(
  userId: string,
  items: CheckoutItem[],
  totalInCents: number,
  currency: string,
) {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id,
      userId,
      totalInCents,
      currency,
      status: "pending",
    });
    await insertOrderItems(tx, id, items);
  });
  return { orderId: id };
}

/** Persist the Stripe session so any retry can redirect to the same intent. */
export async function attachCheckoutSession(input: {
  orderId: string;
  stripeCheckoutSessionId: string;
  checkoutExpiresAt: Date | null;
}) {
  const order = await db
    .select({ stripeCheckoutSessionId: orders.stripeCheckoutSessionId })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order[0]) throw new Error("Cannot attach a Checkout session to an unknown order");
  if (
    order[0].stripeCheckoutSessionId &&
    order[0].stripeCheckoutSessionId !== input.stripeCheckoutSessionId
  ) {
    throw new Error("Order already has a different Stripe Checkout session");
  }

  await db
    .update(orders)
    .set({
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      checkoutExpiresAt: input.checkoutExpiresAt,
    })
    .where(eq(orders.id, input.orderId));
}

/** The expiry event makes the same basket eligible for one new Checkout intent. */
export async function expirePendingCheckout(orderId: string, stripeCheckoutSessionId: string) {
  await db
    .update(orders)
    .set({ status: "failed", checkoutKey: null })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, "pending"),
        eq(orders.stripeCheckoutSessionId, stripeCheckoutSessionId),
      ),
    );
}

async function recordStripeEvent(tx: Transaction, eventId: string, type: string) {
  const inserted = await tx
    .insert(stripeEvents)
    .values({ id: newId(), stripeEventId: eventId, type })
    .onConflictDoNothing({ target: stripeEvents.stripeEventId })
    .returning({ id: stripeEvents.id });

  return inserted.length > 0;
}

function assertPaymentMatchesOrder(
  order: {
    stripeCheckoutSessionId: string | null;
    totalInCents: number;
    currency: string;
  },
  input: { stripeCheckoutSessionId: string; totalInCents: number; currency: string },
) {
  if (
    (order.stripeCheckoutSessionId &&
      order.stripeCheckoutSessionId !== input.stripeCheckoutSessionId) ||
    order.totalInCents !== input.totalInCents ||
    order.currency.toLowerCase() !== input.currency.toLowerCase()
  ) {
    throw new Error("Stripe payment does not match the pending order");
  }
}

/**
 * Atomically records a Stripe event, marks the matching order paid, creates its
 * entitlements and clears only the paid products from the cart. Throwing rolls
 * back the event record too, letting Stripe safely retry transient failures.
 */
export async function fulfillPaidOrderFromWebhook(input: {
  eventId: string;
  eventType: string;
  orderId: string;
  userId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  totalInCents: number;
  currency: string;
}): Promise<FulfillmentResult> {
  return db.transaction(async (tx) => {
    const isNewEvent = await recordStripeEvent(tx, input.eventId, input.eventType);
    if (!isNewEvent) return { kind: "duplicate-event" };

    const order = await tx
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
      })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order[0] || order[0].userId !== input.userId) {
      throw new Error("Stripe event references an unknown order or customer");
    }

    assertPaymentMatchesOrder(order[0], input);

    if (order[0].status === "paid" || order[0].status === "fulfilled") {
      return { kind: "already-fulfilled", orderId: order[0].id };
    }
    if (order[0].status !== "pending") {
      throw new Error("Stripe event references an order that is no longer payable");
    }

    const items = await tx
      .select({ productId: orderItems.productId })
      .from(orderItems)
      .where(eq(orderItems.orderId, input.orderId));

    if (items.length === 0) throw new Error("Pending order has no items to fulfill");

    const paidOrder = await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: new Date(),
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripePaymentIntentId: input.stripePaymentIntentId,
      })
      // A second, distinct Stripe event can race after both transactions read
      // pending. Rechecking the status in SQL makes only one transaction own
      // the transition and entitlement grant.
      .where(and(eq(orders.id, input.orderId), eq(orders.status, "pending")))
      .returning({ id: orders.id });

    if (!paidOrder[0]) return { kind: "already-fulfilled", orderId: input.orderId };

    for (const item of items) {
      await tx
        .insert(entitlements)
        .values({
          id: newId(),
          userId: input.userId,
          productId: item.productId,
          orderId: input.orderId,
        })
        .onConflictDoNothing({ target: [entitlements.userId, entitlements.productId] });
    }

    await tx.delete(cartItems).where(
      and(
        eq(cartItems.userId, input.userId),
        inArray(
          cartItems.productId,
          items.map((item) => item.productId),
        ),
      ),
    );

    return { kind: "fulfilled", orderId: input.orderId };
  });
}

/** Deduplicate and process a failed/expired Stripe Checkout session atomically. */
export async function failCheckoutFromWebhook(input: {
  eventId: string;
  eventType: string;
  orderId: string;
  userId: string;
  stripeCheckoutSessionId: string;
}) {
  return db.transaction(async (tx) => {
    const isNewEvent = await recordStripeEvent(tx, input.eventId, input.eventType);
    if (!isNewEvent) return "duplicate-event" as const;

    const order = await tx
      .select({
        userId: orders.userId,
        status: orders.status,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
      })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order[0] || order[0].userId !== input.userId) {
      throw new Error("Stripe event references an unknown order or customer");
    }
    // A late failure must never overwrite a settled order. It is harmless to
    // acknowledge it even if it belongs to an older Checkout session.
    if (order[0].status !== "pending") return "already-processed" as const;
    if (
      order[0].stripeCheckoutSessionId &&
      order[0].stripeCheckoutSessionId !== input.stripeCheckoutSessionId
    ) {
      throw new Error("Stripe event references a different Checkout session");
    }

    const failedOrder = await tx
      .update(orders)
      .set({
        status: "failed",
        checkoutKey: null,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, "pending")))
      .returning({ id: orders.id });

    return failedOrder[0] ? ("failed" as const) : ("already-processed" as const);
  });
}
