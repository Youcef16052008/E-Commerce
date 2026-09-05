import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * Vérifie la CONFIG des headers de sécurité (registre H-5).
 * Les headers réellement servis par le serveur sont vérifiés en e2e
 * (tests/e2e/home.spec.ts) — ici on fige les valeurs pour qu'aucun
 * « refactor » ne les fasse disparaître silencieusement.
 */
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

describe("next.config — headers de sécurité (H-5)", () => {
  async function getRules(): Promise<HeaderRule[]> {
    const fn = nextConfig.headers;
    expect(fn).toBeTypeOf("function");
    return (await fn!.call(nextConfig)) as HeaderRule[];
  }

  it("applique les headers à toutes les routes", async () => {
    const rules = await getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("définit chaque header de sécurité attendu", async () => {
    const rules = await getRules();
    const map = new Map(rules[0].headers.map((h) => [h.key, h.value]));

    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("Referrer-Policy")).toBe("no-referrer");
    expect(map.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(map.get("Strict-Transport-Security")).toContain("includeSubDomains");
    expect(map.get("Permissions-Policy")).toContain("camera=()");
    expect(map.get("Permissions-Policy")).toContain("microphone=()");
    expect(map.get("Permissions-Policy")).toContain("geolocation=()");
    expect(map.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });
});
