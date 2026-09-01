/**
 * Schémas Zod des frontières admin (produits + statuts de commande).
 * Validés côté service avant toute écriture en base.
 */
import { z } from "zod";

const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 48;

const optionalUrl = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
        message: "URL http(s) requise",
      }),
  ])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const optionalText = (max: number) =>
  z
    .union([z.literal(""), z.string().trim().max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const adminProductCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  genre: optionalText(80),
  language: optionalText(10),
  format: z.enum(["epub", "pdf"]),
  priceInCents: z.number().int().min(0).max(100_000),
  currency: z.literal("usd"),
  coverUrl: optionalUrl,
  fileUrl: optionalUrl,
  published: z.boolean(),
  slug: z.string().trim().regex(slugRegex, "Slug invalide (a-z, 0-9, tirets)").max(120).optional(),
});

export const adminProductUpdateSchema = adminProductCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Au moins un champ est requis",
  });

export const adminOrderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "fulfilled", "failed", "refunded"]),
});

export const adminProductListQuerySchema = z.object({
  q: z.string().trim().min(0).max(120).optional().catch(undefined),
  status: z.enum(["all", "published", "draft"]).catch("all").default("all"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).catch(PAGE_SIZE_DEFAULT),
});

export type AdminProductCreateParsed = z.infer<typeof adminProductCreateSchema>;
export type AdminProductUpdateParsed = z.infer<typeof adminProductUpdateSchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
export type AdminOrderStatusParsed = z.infer<typeof adminOrderStatusSchema>;

export { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX };
