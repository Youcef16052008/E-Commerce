import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";

/**
 * Tables de domaine (Biblio).
 * Les tables d'authentification (user, session, account, verification) sont
 * définies dans ./auth-schema.ts (fournies par Better Auth) et ré-exportées ici.
 */

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    author: text("author").notNull(),
    genre: text("genre"),
    language: text("language").default("fr"),
    format: text("format", { enum: ["epub", "pdf"] })
      .notNull()
      .default("epub"),
    coverUrl: text("cover_url"),
    fileUrl: text("file_url"),
    priceInCents: integer("price_in_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    published: boolean("published").notNull().default(false),
    // Monnaie unique de la boutique : USD (Stripe Checkout est mono-devise).
    // Provenance du catalogue importé (ex. Gutendex / Project Gutenberg).
    source: text("source"),
    sourceId: text("source_id"),
    // Licence du contenu (ex. "domaine public USA" pour Project Gutenberg).
    license: text("license"),
    // Nombre de téléchargements chez la source (utile pour trier l'import).
    downloads: integer("downloads"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_category_idx").on(table.genre),
    index("products_title_idx").on(table.title),
    uniqueIndex("products_source_source_id_idx").on(table.source, table.sourceId),
    check("products_price_non_negative", sql`${table.priceInCents} >= 0`),
    check("products_currency_usd", sql`lower(${table.currency}) = 'usd'`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // A cart row represents one non-transferable personal licence, never a
    // multi-unit physical inventory reservation.
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId] }),
    check("cart_items_personal_license_quantity", sql`${table.quantity} = 1`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["pending", "paid", "fulfilled", "refund_pending", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),
    totalInCents: integer("total_in_cents").notNull(),
    // Monnaie unique de la boutique : USD (Stripe Checkout mono-devise).
    currency: text("currency").notNull().default("usd"),
    /** Stable fingerprint of a pending basket. It makes repeated clicks and
     * concurrent requests converge on one Stripe Checkout intent. */
    checkoutKey: text("checkout_key"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_user_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
    uniqueIndex("orders_checkout_key_idx").on(table.checkoutKey),
    uniqueIndex("orders_stripe_checkout_session_idx").on(table.stripeCheckoutSessionId),
    uniqueIndex("orders_stripe_payment_intent_idx").on(table.stripePaymentIntentId),
    check("orders_total_non_negative", sql`${table.totalInCents} >= 0`),
    check("orders_currency_usd", sql`lower(${table.currency}) = 'usd'`),
    check(
      "orders_status_valid",
      sql`${table.status} in ('pending', 'paid', 'fulfilled', 'refund_pending', 'failed', 'refunded')`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    titleSnapshot: text("title_snapshot").notNull(),
    priceInCents: integer("price_in_cents").notNull(),
    // Snapshot historique : les nouveaux paniers valent toujours 1, mais les
    // anciennes commandes multi-unités restent lisibles.
    quantity: integer("quantity").notNull().default(1),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.productId] }),
    check("order_items_price_non_negative", sql`${table.priceInCents} >= 0`),
    check("order_items_quantity_positive", sql`${table.quantity} >= 1`),
    check("order_items_currency_usd", sql`lower(${table.currency}) = 'usd'`),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("entitlements_user_product_idx").on(table.userId, table.productId),
    index("entitlements_user_idx").on(table.userId),
  ],
);

/**
 * One full-order Stripe refund request. `pending` is intentionally durable until
 * Stripe confirms success or failure with a signed webhook.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    previousOrderStatus: text("previous_order_status", { enum: ["paid", "fulfilled"] }).notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] })
      .notNull()
      .default("pending"),
    amountInCents: integer("amount_in_cents").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    stripeRefundId: text("stripe_refund_id"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("refunds_order_idx").on(table.orderId),
    uniqueIndex("refunds_stripe_refund_idx").on(table.stripeRefundId),
    index("refunds_status_idx").on(table.status),
    index("refunds_requested_by_idx").on(table.requestedByUserId),
    check("refunds_amount_non_negative", sql`${table.amountInCents} >= 0`),
    check("refunds_currency_usd", sql`lower(${table.currency}) = 'usd'`),
    check("refunds_status_valid", sql`${table.status} in ('pending', 'succeeded', 'failed')`),
  ],
);

/**
 * Append-only audit of a read-only Stripe/DB comparison. It never authorizes a
 * financial transition: signed webhooks remain the sole mutation path.
 */
export const stripeSyncLog = pgTable(
  "stripe_sync_log",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
    status: text("status", {
      enum: ["matched", "mismatch", "remote_missing", "remote_error"],
    }).notNull(),
    issueCount: integer("issue_count").notNull().default(0),
    // JSON containing only reconciliation codes/Stripe object IDs, never card,
    // buyer or API-key data.
    details: text("details"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stripe_sync_log_run_idx").on(table.runId),
    index("stripe_sync_log_order_idx").on(table.orderId),
    index("stripe_sync_log_status_idx").on(table.status),
    check("stripe_sync_log_issue_count_non_negative", sql`${table.issueCount} >= 0`),
    check(
      "stripe_sync_log_status_valid",
      sql`${table.status} in ('matched', 'mismatch', 'remote_missing', 'remote_error')`,
    ),
  ],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export { user, session, account, verification } from "./auth-schema";
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type StripeSyncLog = typeof stripeSyncLog.$inferSelect;
