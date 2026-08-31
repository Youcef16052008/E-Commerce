import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, entitlements, products, orders } from "@/server/db/schema";
import { viewLibrary, createDownloadLink } from "@/features/library/application/library-service";
import { deleteObject, isStorageConfigured, parseFileUrl, uploadObject } from "@/server/storage";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration de la bibliothèque contre une base réelle (Neon/Postgres).
 * Nécessite DATABASE_URL + migrations.
 *
 * Les cas liés au stockage sont conditionnés à `isStorageConfigured()` :
 * - stockage configuré → URL pré-signée + GET 200 (contenu intact) ;
 * - stockage absent   → 503 STORAGE_NOT_CONFIGURED.
 *
 * Les produits de test sont créés par la suite (aucune dépendance au seed) :
 * un produit AVEC fichier, un produit SANS fichier (404).
 */

const storageConfigured = isStorageConfigured();
const runId = Date.now();

describe.skipIf(!hasDatabase)("Bibliothèque (intégration)", () => {
  const email = `it-lib-${runId}@biblio.test`;
  const otherEmail = `it-lib-o-${runId}@biblio.test`;
  const objectKey = `books/it-lib-${runId}.epub`;
  const fileUrl = `s3://biblio/${objectKey}`;

  let buyerId = "";
  let otherId = "";
  let productWithFileId = "";
  let productWithoutFileId = "";

  beforeAll(async () => {
    const [buyer] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Lib Buyer", email, role: "customer" })
      .returning({ id: user.id });
    buyerId = buyer.id;

    const [other] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Other", email: otherEmail, role: "customer" })
      .returning({ id: user.id });
    otherId = other.id;

    const [withFile] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-lib-file-${runId}`,
        title: "Intégration avec fichier",
        author: "Tests",
        genre: "Test",
        format: "epub",
        fileUrl,
        priceInCents: 100,
        published: true,
      })
      .returning({ id: products.id });
    productWithFileId = withFile.id;

    const [withoutFile] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-lib-nofile-${runId}`,
        title: "Intégration sans fichier",
        author: "Tests",
        genre: "Test",
        format: "epub",
        fileUrl: null,
        priceInCents: 100,
        published: true,
      })
      .returning({ id: products.id });
    productWithoutFileId = withoutFile.id;

    // Une commande payée réelle (FK `entitlements.order_id → orders.id`).
    const orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: buyerId,
      status: "paid",
      totalInCents: 200,
      currency: "eur",
      paidAt: new Date(),
    });

    await db.insert(entitlements).values([
      {
        id: randomUUID(),
        userId: buyerId,
        productId: productWithFileId,
        orderId,
      },
      {
        id: randomUUID(),
        userId: buyerId,
        productId: productWithoutFileId,
        orderId,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(entitlements).where(eq(entitlements.userId, buyerId));
    await db.delete(entitlements).where(eq(entitlements.userId, otherId));
    await db.delete(orders).where(eq(orders.userId, buyerId));
    await db.delete(products).where(eq(products.id, productWithFileId));
    await db.delete(products).where(eq(products.id, productWithoutFileId));
    await db.delete(user).where(eq(user.email, email));
    await db.delete(user).where(eq(user.email, otherEmail));

    if (storageConfigured) {
      await deleteObject(objectKey).catch(() => {});
    }
  });

  it("liste les ouvrages pour lesquels l'utilisateur a un droit d'accès", async () => {
    const items = await viewLibrary(buyerId);
    expect(items.length).toBe(2);
    const withFile = items.find((i) => i.productId === productWithFileId);
    const withoutFile = items.find((i) => i.productId === productWithoutFileId);
    expect(withFile).toBeDefined();
    expect(withoutFile).toBeDefined();
    expect(withFile!.slug).toBe(`it-lib-file-${runId}`);
    expect(withFile!.format).toBe("epub");
    expect(withFile!.fileUrl).toBe(fileUrl);
    expect(withFile!.purchasedAt).toBeInstanceOf(Date);
    expect(withoutFile!.fileUrl).toBeNull();
  });

  it("refuse le téléchargement à un utilisateur SANS droit (NOT_ENTITLED)", async () => {
    const res = await createDownloadLink(otherId, productWithFileId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_ENTITLED");
  });

  it("refuse le téléchargement si le produit n'a pas de fichier (FILE_NOT_AVAILABLE)", async () => {
    const res = await createDownloadLink(buyerId, productWithoutFileId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FILE_NOT_AVAILABLE");
  });

  it.skipIf(!storageConfigured)(
    "refuse le téléchargement si le stockage n'est pas configuré (STORAGE_NOT_CONFIGURED)",
    async () => {
      const res = await createDownloadLink(buyerId, productWithFileId);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("STORAGE_NOT_CONFIGURED");
    },
  );

  it.skipIf(!storageConfigured)(
    "génère une URL pré-signée dont on télécharge réellement le contenu (200, contenu intact)",
    async () => {
      const payload = Buffer.from(
        "PK\u0003\u0004 it-biblio-slice5: contenu de test " + runId,
        "utf8",
      );
      await uploadObject(objectKey, payload, "application/epub+zip");

      const res = await createDownloadLink(buyerId, productWithFileId);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const parsed = new URL(res.url);
      expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
      expect(parseFileUrl(fileUrl).key).toBe(objectKey);

      const downloaded = await fetch(res.url);
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get("content-type")).toContain("application/epub+zip");
      const body = Buffer.from(await downloaded.arrayBuffer());
      expect(body.equals(payload)).toBe(true);
    },
  );
});
