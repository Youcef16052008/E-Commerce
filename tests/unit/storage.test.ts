import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPresignedDownloadUrl,
  getStorageConfig,
  isStorageConfigured,
  parseFileUrl,
} from "@/server/storage";

/**
 * Tests unitaires de l'adaptateur de stockage (aucun réseau requis :
 * la pré-signature SigV4 est un calcul local du SDK AWS).
 */

const STORAGE_KEYS = [
  "STORAGE_ACCOUNT_ID",
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_REGION",
  "STORAGE_FORCE_PATH_STYLE",
] as const;

const initialEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of STORAGE_KEYS) {
    initialEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of STORAGE_KEYS) {
    if (initialEnv[key] === undefined) delete process.env[key];
    else process.env[key] = initialEnv[key]!;
  }
});

function setStorageEnv(overrides: Partial<Record<(typeof STORAGE_KEYS)[number], string>> = {}) {
  Object.assign(process.env, {
    STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    STORAGE_ACCESS_KEY_ID: "test-access-key",
    STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
    STORAGE_BUCKET: "biblio",
    STORAGE_REGION: "us-east-1",
    ...overrides,
  });
}

describe("getStorageConfig", () => {
  it("déduit l'endpoint R2 depuis STORAGE_ACCOUNT_ID (prioritaire sur STORAGE_ENDPOINT)", () => {
    setStorageEnv({ STORAGE_ACCOUNT_ID: "abc123", STORAGE_ENDPOINT: "http://localhost:9000" });
    const c = getStorageConfig();
    expect(c.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
  });

  it("utilise STORAGE_ENDPOINT quand STORAGE_ACCOUNT_ID est absent", () => {
    setStorageEnv();
    const c = getStorageConfig();
    expect(c.endpoint).toBe("http://127.0.0.1:9000");
  });

  it("force le style de chemin par défaut (true) et accepte false explicite", () => {
    setStorageEnv();
    expect(getStorageConfig().forcePathStyle).toBe(true);

    setStorageEnv({ STORAGE_FORCE_PATH_STYLE: "false" });
    expect(getStorageConfig().forcePathStyle).toBe(false);
  });

  it("région par défaut : auto (R2)", () => {
    setStorageEnv();
    delete process.env.STORAGE_REGION;
    expect(getStorageConfig().region).toBe("auto");
  });
});

describe("isStorageConfigured", () => {
  it("est faux sans credentials ni endpoint", () => {
    expect(isStorageConfigured()).toBe(false);
  });

  it("est vrai quand toutes les variables critiques sont présentes", () => {
    setStorageEnv();
    expect(isStorageConfigured()).toBe(true);
  });

  it("est faux s'il manque le secret, le bucket ou l'endpoint", () => {
    setStorageEnv({ STORAGE_SECRET_ACCESS_KEY: "" });
    expect(isStorageConfigured()).toBe(false);

    setStorageEnv({ STORAGE_BUCKET: "" });
    expect(isStorageConfigured()).toBe(false);

    setStorageEnv({ STORAGE_ENDPOINT: "" });
    expect(isStorageConfigured()).toBe(false);
  });
});

describe("parseFileUrl", () => {
  it("extrait la clé d'un fileUrl canonique s3://<bucket>/<cle>", () => {
    const parsed = parseFileUrl("s3://biblio/books/la-mer-des-etoiles.epub");
    expect(parsed.bucket).toBe("biblio");
    expect(parsed.key).toBe("books/la-mer-des-etoiles.epub");
  });

  it("extrait la clé d'une URL HTTPS directe", () => {
    const parsed = parseFileUrl("https://biblio.s3.us-east-1.amazonaws.com/books/x.pdf");
    expect(parsed.bucket).toBeNull();
    expect(parsed.key).toBe("books/x.pdf");
  });

  it("ne conserve jamais de slash initial", () => {
    expect(parseFileUrl("s3://b/books/y.epub").key.startsWith("/")).toBe(false);
  });
});

describe("createPresignedDownloadUrl", () => {
  it("produit une URL pré-signée SigV4 (query-string) avec TTL court", async () => {
    setStorageEnv();
    const url = await createPresignedDownloadUrl("books/la-mer-des-etoiles.epub", 900);
    const parsed = new URL(url);

    // Path-style : l'endpoint est suivi de /<bucket>/<cle>.
    expect(parsed.pathname).toBe("/biblio/books/la-mer-des-etoiles.epub");

    const params = parsed.searchParams;
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Expires")).toBe("900");
    expect(params.get("X-Amz-Credential")).toContain("test-access-key");
    expect(params.get("X-Amz-Credential")).toContain("us-east-1");
    expect(params.get("X-Amz-Credential")).toContain("s3/aws4_request");
    expect(params.get("X-Amz-Date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("respecte un TTL personnalisé", async () => {
    setStorageEnv();
    const url = await createPresignedDownloadUrl("books/x.epub", 60);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("lève une erreur explicite si le stockage n'est pas configuré", async () => {
    await expect(createPresignedDownloadUrl("books/x.epub")).rejects.toThrow(
      /Stockage non configuré/,
    );
  });
});
