import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  account,
  cartItems,
  entitlements,
  orderItems,
  orders,
  products,
  session,
  user,
} from "@/server/db/schema";
import { deleteAccount, exportAccount } from "@/features/account/application/account-service";
import { hasDatabase } from "./has-database";

/**
 * Intégration RGPD (L5.2) : export + suppression (hard / anonymise / blocked)
 * contre une base réelle. Utilisateurs `it-%@biblio.test` (nettoyage standard).
 */
const runId = Date.now();

async function makeUser(tag: string) {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: `Acct ${tag}`,
    email: `it-acct-${tag}-${runId}@biblio.test`,
    role: "customer",
  });
  await db.insert(session).values({
    id: randomUUID(),
    token: randomUUID(),
    userId: id,
    expiresAt: new Date(Date.now() + 3600_000),
    userAgent: "vitest",
  });
  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: "hashed-not-real",
  });
  return id;
}

describe.skipIf(!hasDatabase)("Compte RGPD (intégration)", () => {
  let productId = "";
  const created: string[] = [];

  beforeAll(async () => {
    const [p] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-acct-${runId}`,
        title: "Livre RGPD",
        author: "Test",
        priceInCents: 50,
        currency: "usd",
        format: "epub",
        published: true,
      })
      .returning({ id: products.id });
    productId = p.id;
  });

  afterAll(async () => {
    // Ordre imposé par les FK RESTRICT : commandes → utilisateurs → produit.
    for (const id of created) {
      await db.delete(orders).where(eq(orders.userId, id));
      await db.delete(user).where(eq(user.id, id));
    }
    await db.delete(products).where(eq(products.id, productId));
  });

  it("export : profil + commandes + articles + droits + sessions", async () => {
    const uid = await makeUser("export");
    created.push(uid);
    const orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: uid,
      status: "fulfilled",
      totalInCents: 50,
      currency: "usd",
      paidAt: new Date(),
    });
    await db.insert(orderItems).values({
      orderId,
      productId,
      titleSnapshot: "Livre RGPD",
      priceInCents: 50,
      quantity: 1,
      currency: "usd",
    });
    await db.insert(entitlements).values({ id: randomUUID(), userId: uid, productId, orderId });
    await db.insert(cartItems).values({ userId: uid, productId });

    const out = await exportAccount(uid);
    expect(out).not.toBeNull();
    expect(out!.profile.email).toContain("it-acct-export-");
    expect(out!.orders).toHaveLength(1);
    expect(out!.orders[0]!.items[0]!.title).toBe("Livre RGPD");
    expect(out!.entitlements).toHaveLength(1);
    expect(out!.cart).toHaveLength(1);
    expect(out!.sessions).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("hashed-not-real");
  });

  it("suppression sans commande → hard delete, sessions/credentials disparus", async () => {
    const uid = await makeUser("hard");
    const res = await deleteAccount(uid);
    expect(res).toEqual({ ok: true, mode: "hard" });
    expect(await db.select().from(user).where(eq(user.id, uid))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, uid))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, uid))).toHaveLength(0);
    expect(await exportAccount(uid)).toBeNull();
  });

  it("suppression avec commande soldée → anonymisation, commande conservée", async () => {
    const uid = await makeUser("anon");
    created.push(uid);
    const orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: uid,
      status: "fulfilled",
      totalInCents: 50,
      currency: "usd",
      paidAt: new Date(),
    });
    await db.insert(entitlements).values({ id: randomUUID(), userId: uid, productId, orderId });
    await db.insert(cartItems).values({ userId: uid, productId });

    const res = await deleteAccount(uid);
    expect(res).toEqual({ ok: true, mode: "anonymise" });

    const [row] = await db.select().from(user).where(eq(user.id, uid));
    expect(row!.email).toBe(`deleted-${uid}@anonymised.invalid`);
    expect(row!.name).toBe("Compte supprimé");
    expect(await db.select().from(session).where(eq(session.userId, uid))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, uid))).toHaveLength(0);
    expect(await db.select().from(cartItems).where(eq(cartItems.userId, uid))).toHaveLength(0);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, uid))).toHaveLength(
      0,
    );
    const kept = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(kept).toHaveLength(1);
    expect(kept[0]!.status).toBe("fulfilled");
  });

  it("commande en attente → refus 'blocked', rien n'est modifié", async () => {
    const uid = await makeUser("blocked");
    created.push(uid);
    await db.insert(orders).values({
      id: randomUUID(),
      userId: uid,
      status: "pending",
      totalInCents: 50,
      currency: "usd",
    });
    const res = await deleteAccount(uid);
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.detail).toEqual({ mode: "blocked", reason: "order_in_flight", inFlight: 1 });
    expect(await db.select().from(session).where(eq(session.userId, uid))).toHaveLength(1);
  });
});
