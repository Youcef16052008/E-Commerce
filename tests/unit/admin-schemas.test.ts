import { describe, expect, it } from "vitest";
import {
  adminProductCreateSchema,
  adminProductUpdateSchema,
  adminOrderStatusSchema,
  adminProductListQuerySchema,
  PAGE_SIZE_DEFAULT,
} from "@/features/admin/domain/admin-schemas";
import { slugify } from "@/shared/lib/slugify";

const validCreate = {
  title: "Les Misérables",
  author: "Victor Hugo",
  format: "epub" as const,
  priceInCents: 50,
  currency: "usd" as const,
  published: true,
};

describe("adminProductCreateSchema", () => {
  it("accepte un produit valide minimal", () => {
    const r = adminProductCreateSchema.safeParse(validCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("Les Misérables");
      expect(r.data.priceInCents).toBe(50);
      expect(r.data.currency).toBe("usd");
    }
  });

  it("exige title et author", () => {
    expect(adminProductCreateSchema.safeParse({ ...validCreate, title: "" }).success).toBe(false);
    expect(adminProductCreateSchema.safeParse({ ...validCreate, author: "" }).success).toBe(false);
    expect(adminProductCreateSchema.safeParse({ ...validCreate, title: undefined }).success).toBe(
      false,
    );
  });

  it("rejette un prix négatif", () => {
    expect(adminProductCreateSchema.safeParse({ ...validCreate, priceInCents: -1 }).success).toBe(
      false,
    );
  });

  it("rejette un prix non entier", () => {
    expect(adminProductCreateSchema.safeParse({ ...validCreate, priceInCents: 1.5 }).success).toBe(
      false,
    );
  });

  it("rejette un format invalide", () => {
    expect(adminProductCreateSchema.safeParse({ ...validCreate, format: "mobi" }).success).toBe(
      false,
    );
  });

  it("accepte coverUrl/fileUrl vides (→ null)", () => {
    const r = adminProductCreateSchema.safeParse({
      ...validCreate,
      coverUrl: "",
      fileUrl: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.coverUrl).toBeNull();
      expect(r.data.fileUrl).toBeNull();
    }
  });

  it("accepte une URL http(s)", () => {
    const r = adminProductCreateSchema.safeParse({
      ...validCreate,
      coverUrl: "https://example.com/cover.jpg",
    });
    expect(r.success).toBe(true);
  });

  it("valide le slug optionnel", () => {
    expect(
      adminProductCreateSchema.safeParse({ ...validCreate, slug: "les-miserables" }).success,
    ).toBe(true);
    expect(
      adminProductCreateSchema.safeParse({ ...validCreate, slug: "Les Miserables" }).success,
    ).toBe(false);
    expect(adminProductCreateSchema.safeParse({ ...validCreate, slug: "-bad-" }).success).toBe(
      false,
    );
  });
});

describe("adminProductUpdateSchema", () => {
  it("rejette un objet vide", () => {
    expect(adminProductUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepte une mise à jour partielle", () => {
    const r = adminProductUpdateSchema.safeParse({ published: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.published).toBe(false);
  });

  it("accepte title seul", () => {
    expect(adminProductUpdateSchema.safeParse({ title: "Nouveau titre" }).success).toBe(true);
  });
});

describe("adminOrderStatusSchema", () => {
  it("accepte les 5 statuts", () => {
    for (const status of ["pending", "paid", "fulfilled", "failed", "refunded"]) {
      expect(adminOrderStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejette un statut inconnu", () => {
    expect(adminOrderStatusSchema.safeParse({ status: "shipped" }).success).toBe(false);
  });
});

describe("adminProductListQuerySchema", () => {
  it("applique les défauts (page, pageSize, status)", () => {
    const q = adminProductListQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(PAGE_SIZE_DEFAULT);
    expect(q.status).toBe("all");
  });

  it("ramène une pageSize hors bornes au défaut", () => {
    const q = adminProductListQuerySchema.parse({ pageSize: "999" });
    expect(q.pageSize).toBe(PAGE_SIZE_DEFAULT);
  });
});

describe("slugify (admin)", () => {
  it("normalise accents et espaces", () => {
    expect(slugify("Les Misérables")).toBe("les-miserables");
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });

  it("retombe sur « livre » si vide", () => {
    expect(slugify("@@@")).toBe("livre");
    expect(slugify("")).toBe("livre");
  });
});
