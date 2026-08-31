/**
 * Service applicatif admin — CRUD produits.
 * Validation Zod + unicité de slug + refus de suppression si référencé.
 */
import { randomUUID } from "node:crypto";
import {
  adminProductCreateSchema,
  adminProductUpdateSchema,
  adminProductListQuerySchema,
} from "../domain/admin-schemas";
import type { AdminError } from "../domain/admin-types";
import {
  listAllProducts,
  getProductById,
  slugExists,
  insertProduct,
  updateProductById,
  deleteProductById,
  hasProductReferences,
} from "../infrastructure/admin-repo";
import { slugify } from "@/shared/lib/slugify";
import type { Product } from "@/server/db/schema";

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base || "livre";
  if (!(await slugExists(candidate, excludeId))) return candidate;

  for (let i = 2; i < 1000; i++) {
    candidate = `${base}-${i}`;
    if (!(await slugExists(candidate, excludeId))) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function queryAdminProducts(raw: unknown) {
  const query = adminProductListQuerySchema.parse(raw);
  return listAllProducts({
    q: query.q,
    status: query.status ?? "all",
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function getAdminProduct(id: string): Promise<Product | null> {
  return getProductById(id);
}

export async function createAdminProduct(
  raw: unknown,
): Promise<{ ok: true; product: Product } | { ok: false; error: AdminError }> {
  const parsed = adminProductCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", status: 400, message: parsed.error.message },
    };
  }
  const data = parsed.data;

  let slug = data.slug?.trim() || slugify(data.title);
  if (!slug) slug = "livre";

  // Si le slug est fourni explicitement et déjà pris → 409 (pas de suffixe auto).
  if (data.slug) {
    if (await slugExists(slug)) {
      return { ok: false, error: { code: "SLUG_TAKEN", status: 409 } };
    }
  } else {
    slug = await uniqueSlug(slug);
  }

  const product = await insertProduct({
    id: randomUUID(),
    slug,
    title: data.title,
    author: data.author,
    description: data.description ?? null,
    genre: data.genre ?? null,
    language: data.language ?? "fr",
    format: data.format,
    priceInCents: data.priceInCents,
    currency: data.currency,
    coverUrl: data.coverUrl ?? null,
    fileUrl: data.fileUrl ?? null,
    published: data.published,
  });

  return { ok: true, product };
}

export async function updateAdminProduct(
  id: string,
  raw: unknown,
): Promise<{ ok: true; product: Product } | { ok: false; error: AdminError }> {
  const existing = await getProductById(id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }

  const parsed = adminProductUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", status: 400, message: parsed.error.message },
    };
  }
  const data = parsed.data;

  if (data.slug !== undefined) {
    const slug = data.slug.trim();
    if (await slugExists(slug, id)) {
      return { ok: false, error: { code: "SLUG_TAKEN", status: 409 } };
    }
  }

  const product = await updateProductById(id, {
    ...(data.slug !== undefined ? { slug: data.slug.trim() } : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.author !== undefined ? { author: data.author } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.genre !== undefined ? { genre: data.genre } : {}),
    ...(data.language !== undefined ? { language: data.language } : {}),
    ...(data.format !== undefined ? { format: data.format } : {}),
    ...(data.priceInCents !== undefined ? { priceInCents: data.priceInCents } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
    ...(data.fileUrl !== undefined ? { fileUrl: data.fileUrl } : {}),
    ...(data.published !== undefined ? { published: data.published } : {}),
  });

  if (!product) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }
  return { ok: true, product };
}

export async function removeAdminProduct(
  id: string,
): Promise<{ ok: true } | { ok: false; error: AdminError }> {
  const existing = await getProductById(id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }

  if (await hasProductReferences(id)) {
    return { ok: false, error: { code: "PRODUCT_REFERENCED", status: 409 } };
  }

  const deleted = await deleteProductById(id);
  if (!deleted) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }
  return { ok: true };
}
