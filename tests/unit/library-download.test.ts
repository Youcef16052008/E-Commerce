import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `createDownloadLink` — chemin « stockage configuré » (L5.3, plancher de
 * couverture entitlements). Le dépôt est simulé ; la pré-signature SigV4 est un
 * calcul local du SDK : aucun réseau, aucun bucket requis.
 */
vi.mock("@/features/library/infrastructure/library-repo", () => ({
  listUserLibrary: vi.fn(),
  userHasEntitlement: vi.fn(),
  getProductFile: vi.fn(),
}));

import { getProductFile, userHasEntitlement } from "@/features/library/infrastructure/library-repo";
import { createDownloadLink } from "@/features/library/application/library-service";

const STORAGE_ENV = {
  STORAGE_ENDPOINT: "http://127.0.0.1:9000",
  STORAGE_ACCESS_KEY_ID: "biblioapp",
  STORAGE_SECRET_ACCESS_KEY: "biblioapp-secret",
  STORAGE_BUCKET: "biblio",
  STORAGE_REGION: "us-east-1",
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [k, v] of Object.entries(STORAGE_ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  delete process.env.STORAGE_ACCOUNT_ID;
  vi.mocked(userHasEntitlement).mockResolvedValue(true);
});

afterEach(() => {
  for (const k of Object.keys(STORAGE_ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.clearAllMocks();
});

describe("createDownloadLink (stockage configuré)", () => {
  it("entitlement + fichier s3:// → URL pré-signée SigV4 de 15 min, en pièce jointe", async () => {
    vi.mocked(getProductFile).mockResolvedValue({
      id: "p1",
      fileUrl: "s3://biblio/books/candide.epub",
    });
    const res = await createDownloadLink("u1", "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const url = new URL(res.url);
    expect(url.origin).toBe("http://127.0.0.1:9000");
    expect(url.pathname).toBe("/biblio/books/candide.epub");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("response-content-disposition")).toBe("attachment");
    expect(res.url).not.toContain("biblioapp-secret");
  });

  it("sans entitlement → NOT_ENTITLED, sans lire le fichier", async () => {
    vi.mocked(userHasEntitlement).mockResolvedValue(false);
    const res = await createDownloadLink("u1", "p1");
    expect(res).toEqual({ ok: false, error: { code: "NOT_ENTITLED" } });
    expect(getProductFile).not.toHaveBeenCalled();
  });

  it("fileUrl absent, illisible ou sans clé → FILE_NOT_AVAILABLE", async () => {
    for (const fileUrl of [null, "not a url", "s3://biblio/"]) {
      vi.mocked(getProductFile).mockResolvedValue({ id: "p1", fileUrl });
      const res = await createDownloadLink("u1", "p1");
      expect(res).toEqual({ ok: false, error: { code: "FILE_NOT_AVAILABLE" } });
    }
  });

  it("stockage non configuré → STORAGE_NOT_CONFIGURED (jamais d'URL inventée)", async () => {
    delete process.env.STORAGE_ACCESS_KEY_ID;
    vi.mocked(getProductFile).mockResolvedValue({ id: "p1", fileUrl: "s3://biblio/books/x.epub" });
    const res = await createDownloadLink("u1", "p1");
    expect(res).toEqual({ ok: false, error: { code: "STORAGE_NOT_CONFIGURED" } });
  });
});
