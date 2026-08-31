import { describe, it, expect } from "vitest";
import { formatPrice } from "@/shared/lib/format";
import {
  parseProductListQuery,
  PAGE_SIZE_DEFAULT,
} from "@/features/products/application/product-query-schema";

describe("formatPrice", () => {
  it("formate des centimes en euros (fr-FR)", () => {
    expect(formatPrice(899, "eur")).toMatch("8,99");
    expect(formatPrice(1499, "eur")).toMatch("14,99");
    expect(formatPrice(0, "eur")).toMatch("0");
  });

  it("défaut sur EUR", () => {
    expect(formatPrice(1000)).toMatch("10,00");
  });
});

describe("parseProductListQuery", () => {
  it("applique les valeurs par défaut", () => {
    const q = parseProductListQuery({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(PAGE_SIZE_DEFAULT);
    expect(q.sort).toBeUndefined();
  });

  it("coerce les pages numériques", () => {
    const q = parseProductListQuery({ page: "3" });
    expect(q.page).toBe(3);
  });

  it("ramène une pageSize hors bornes à la valeur par défaut (fallback)", () => {
    const q = parseProductListQuery({ pageSize: "999" });
    expect(q.pageSize).toBe(PAGE_SIZE_DEFAULT);
  });

  it("rejette les valeurs de tri invalides", () => {
    expect(() => parseProductListQuery({ sort: "nimporte" })).not.toThrow();
  });
});
