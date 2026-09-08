import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
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
    index("products_source_idx").on(table.source, table.sourceId),
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
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId] })],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["pending", "paid", "fulfilled", "failed", "refunded"],
    })
      .notNull()
      .default("pending"),
    totalInCents: integer("total_in_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    stripeRefundId: text("stripe_refund_id"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundAmountInCents: integer("refund_amount_in_cents"),
  },
  (table) => [
    index("orders_user_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
    index("orders_stripe_refund_id_idx").on(table.stripeRefundId),
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
    // Quantité achetée (snapshot — le panier autorise 1..10).
    quantity: integer("quantity").notNull().default(1),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.productId] })],
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

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("stripe_events_id_idx").on(table.stripeEventId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    stripeRefundId: text("stripe_refund_id").notNull().unique(),
    amountInCents: integer("amount_in_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("succeeded"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refunds_order_idx").on(table.orderId),
    index("refunds_stripe_refund_id_idx").on(table.stripeRefundId),
  ],
);

export const stripeSyncLog = pgTable(
  "stripe_sync_log",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    eventId: text("event_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("success"),
    details: text("details"),
  },
  (table) => [
    uniqueIndex("stripe_sync_log_event_id_idx").on(table.eventId),
    index("stripe_sync_log_event_type_idx").on(table.eventType),
  ],
);

export { user, session, account, verification } from "./auth-schema";
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type StripeSyncLog = typeof stripeSyncLog.$inferSelect;
