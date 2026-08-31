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
    currency: text("currency").notNull().default("eur"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_user_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
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
    currency: text("currency").notNull().default("eur"),
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

export { user, session, account, verification } from "./auth-schema";
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
