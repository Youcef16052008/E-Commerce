/**
 * Dépôt admin : lecture/écriture de tous les produits (y compris brouillons)
 * et de toutes les commandes (avec email/nom client).
 */
import { and, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "@/server/db";
import { products, orders, orderItems, entitlements, user } from "@/server/db/schema";
import type { AdminProductListParams } from "../domain/admin-types";
import type { Product } from "@/server/db/schema";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

export async function listAllProducts(params: AdminProductListParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (params.q) {
    const like = `%${params.q}%`;
    conditions.push(or(ilike(products.title, like), ilike(products.author, like))!);
  }

  if (params.status === "published") {
    conditions.push(eq(products.published, true));
  } else if (params.status === "draft") {
    conditions.push(eq(products.published, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ value: total }] = await db.select({ value: count() }).from(products).where(where);

  const items = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.updatedAt))
    .limit(pageSize)
    .offset(offset);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { items, total, page, pageSize, totalPages };
}

export async function getProductById(id: string): Promise<Product | null> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const conditions = [eq(products.slug, slug)];
  if (excludeId) {
    conditions.push(ne(products.id, excludeId));
  }
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

export async function insertProduct(data: {
  id: string;
  slug: string;
  title: string;
  author: string;
  description: string | null;
  genre: string | null;
  language: string | null;
  format: "epub" | "pdf";
  priceInCents: number;
  currency: string;
  coverUrl: string | null;
  fileUrl: string | null;
  published: boolean;
}): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({
      id: data.id,
      slug: data.slug,
      title: data.title,
      author: data.author,
      description: data.description,
      genre: data.genre,
      language: data.language ?? "fr",
      format: data.format,
      priceInCents: data.priceInCents,
      currency: data.currency,
      coverUrl: data.coverUrl,
      fileUrl: data.fileUrl,
      published: data.published,
    })
    .returning();
  return row;
}

export async function updateProductById(
  id: string,
  data: Partial<{
    slug: string;
    title: string;
    author: string;
    description: string | null;
    genre: string | null;
    language: string | null;
    format: "epub" | "pdf";
    priceInCents: number;
    currency: string;
    coverUrl: string | null;
    fileUrl: string | null;
    published: boolean;
  }>,
): Promise<Product | null> {
  const [row] = await db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProductById(id: string): Promise<boolean> {
  const deleted = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id });
  return deleted.length > 0;
}

/** True si le produit apparaît dans au moins une ligne `order_items` (FK RESTRICT). */
export async function hasProductReferences(id: string): Promise<boolean> {
  const rows = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);
  return rows.length > 0;
}

export async function listAllOrdersWithUsers() {
  const orderRows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      totalInCents: orders.totalInCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      userEmail: user.email,
      userName: user.name,
    })
    .from(orders)
    .innerJoin(user, eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) {
    return { orders: orderRows, items: [] as (typeof orderItems.$inferSelect)[] };
  }

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        orderRows.map((o) => o.id),
      ),
    );

  return { orders: orderRows, items: itemRows };
}

export async function getOrderById(id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateOrderStatusById(id: string, status: OrderStatus) {
  const [row] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
  return row ?? null;
}

/**
 * Rembourse une commande (registre H-6) : passe `refunded` ET révoque les
 * droits d'accès (entitlements) — dans une seule transaction.
 *
 * La révocation se fait par PRODUIT de la commande : l'entitlement d'un produit
 * peut avoir été créé par une autre commande (achat en double — index unique
 * (user, produit)) ; on le conserve uniquement si le même produit est encore
 * couvert par une autre commande `paid`/`fulfilled` du même utilisateur.
 *
 * Retourne null si la commande n'existe pas.
 */
export async function refundOrderById(id: string) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: "refunded" as OrderStatus })
      .where(eq(orders.id, id))
      .returning();
    if (updated.length === 0) {
      return null;
    }
    const order = updated[0];

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    for (const item of items) {
      const [ent] = await tx
        .select()
        .from(entitlements)
        .where(
          and(eq(entitlements.userId, order.userId), eq(entitlements.productId, item.productId)),
        )
        .limit(1);
      if (!ent) continue;

      const [other] = await tx
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orders.userId, order.userId),
            ne(orders.id, id),
            inArray(orders.status, ["paid", "fulfilled"]),
            eq(orderItems.productId, item.productId),
          ),
        )
        .limit(1);

      // plus aucune commande payée ne couvre ce produit → révocation
      if (!other) {
        await tx.delete(entitlements).where(eq(entitlements.id, ent.id));
      }
    }

    return order;
  });
}
