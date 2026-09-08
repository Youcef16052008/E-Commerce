/**
 * Nettoyage des données de TEST accumulées dans une base de DEV LOCALE
 * (registre L-4). En CI la base est éphémère : inutile d'appeler ce script.
 *
 * Supprime (uniquement les motifs de test, jamais le seed démo ni les données
 * réelles) :
 * - les utilisateurs `e2e-%@biblio.test` (Playwright) et `it-%@biblio.test`
 *   (tests d'intégration orphelins) + leurs orders/entitlements/paniers
 *   (cascade) ;
 * - les produits dont le slug commence par `e2e-` ou `it-` (ceux encore
 *   référencés par une commande sont signalés et conservés).
 *
 * Usage : `npm run db:cleanup:tests`
 */
import "./load-env";
import { eq, inArray, like, or } from "drizzle-orm";
import { db } from "../src/server/db";
import { user, orders, orderItems, products, cartItems, refunds } from "../src/server/db/schema";

async function main() {
  const testUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(or(like(user.email, "e2e-%@biblio.test"), like(user.email, "it-%@biblio.test"))!);

  let ordersDeleted = 0;
  if (testUsers.length > 0) {
    const userIds = testUsers.map((u) => u.id);
    const ordersOfTest = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.userId, userIds));
    if (ordersOfTest.length > 0) {
      const orderIds = ordersOfTest.map((o) => o.id);
      await db.delete(refunds).where(inArray(refunds.orderId, orderIds)).catch(() => undefined);
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
      ordersDeleted = orderIds.length;
    }
    await db.delete(cartItems).where(inArray(cartItems.userId, userIds));
    await db.delete(user).where(inArray(user.id, userIds));
  }

  const testProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(or(like(products.slug, "e2e-%"), like(products.slug, "it-%")));

  let productsDeleted = 0;
  let productsKept = 0;
  for (const p of testProducts) {
    const deleted = await db
      .delete(products)
      .where(eq(products.id, p.id))
      .returning({ id: products.id })
      .catch(() => undefined);
    if (deleted && deleted.length > 0) {
      productsDeleted += 1;
    } else {
      productsKept += 1;
    }
  }

  console.log(
    `✓ Cleanup terminé : ${testUsers.length} utilisateurs de test, ${ordersDeleted} commandes, ${productsDeleted} produits supprimés.`,
  );
  if (productsKept > 0) {
    console.log(
      `⚠️ ${productsKept} produit(s) de test encore référencé(s) par des commandes (FK) — conservés.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
