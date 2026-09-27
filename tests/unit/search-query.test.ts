import { describe, expect, it } from "vitest";
import { toPrefixTsQuery } from "@/features/products/domain/search-query";

/** Constructeur de tsquery (L6.2) : sûr, accent-insensible, préfixes. */
describe("toPrefixTsQuery", () => {
  it("vide / espaces / ponctuation seule → null", () => {
    expect(toPrefixTsQuery(undefined)).toBeNull();
    expect(toPrefixTsQuery("")).toBeNull();
    expect(toPrefixTsQuery("   ")).toBeNull();
    expect(toPrefixTsQuery("&|!():'")).toBeNull();
  });

  it("jetons en minuscules, sans accents, en préfixe, reliés par ET", () => {
    expect(toPrefixTsQuery("Les Misérables")).toBe("les:* & miserables:*");
    expect(toPrefixTsQuery("  Étoiles  mer ")).toBe("etoiles:* & mer:*");
  });

  it("neutralise les opérateurs tsquery et les quotes", () => {
    expect(toPrefixTsQuery("a & b | !c (d) 'e' f:*")).toBe("a:* & b:* & c:* & d:* & e:* & f:*");
  });

  it("borne le nombre et la longueur des jetons", () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`).join(" ");
    expect(toPrefixTsQuery(many)!.split(" & ")).toHaveLength(8);
    expect(toPrefixTsQuery("x".repeat(100))).toBe(`${"x".repeat(40)}:*`);
  });

  it("chiffres et alphabets non latins conservés", () => {
    expect(toPrefixTsQuery("1984 Orwell")).toBe("1984:* & orwell:*");
    expect(toPrefixTsQuery("مقدمة")).toBe("مقدمة:*");
  });
});
