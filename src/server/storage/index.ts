import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Adaptateur de stockage objet (S3 compatible : MinIO / Cloudflare R2 / AWS S3).
 *
 * - Les URLs de téléchargement sont PRÉ-SIGNÉES (SigV4, query-string) via le SDK
 *   officiel `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` : les fichiers
 *   ne transitent jamais par le serveur applicatif.
 * - `forcePathStyle` est activé par défaut : c'est le format requis par MinIO
 *   (`http://host:port/bucket/key`) et la forme canonique de R2
 *   (`https://<account>.r2.cloudflarestorage.com/bucket/key`).
 */

export interface StorageConfig {
  /** Clé d'accès (utilisateur applicatif S3). */
  accessKeyId: string | undefined;
  /** Secret de la clé d'accès. */
  secretAccessKey: string | undefined;
  /** Nom du bucket contenant les e-books. */
  bucket: string | undefined;
  /** Région S3 (`us-east-1` pour MinIO, `auto` pour R2). */
  region: string;
  /** Endpoint S3 (optionnel si `STORAGE_ACCOUNT_ID` est fourni pour R2). */
  endpoint: string | undefined;
  /** Style de chemin (`http://host/bucket/key`) au lieu du style virtual-host. */
  forcePathStyle: boolean;
}

/**
 * Lit la configuration depuis l'environnement.
 * `STORAGE_ACCOUNT_ID` prime sur `STORAGE_ENDPOINT` et construit l'endpoint R2.
 */
export function getStorageConfig(): StorageConfig {
  const accountId = process.env.STORAGE_ACCOUNT_ID?.trim();
  const endpoint = accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : process.env.STORAGE_ENDPOINT?.trim() || undefined;

  const forcePathStyleRaw = (process.env.STORAGE_FORCE_PATH_STYLE ?? "true").trim().toLowerCase();

  return {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID?.trim() || undefined,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY?.trim() || undefined,
    bucket: process.env.STORAGE_BUCKET?.trim() || undefined,
    region: process.env.STORAGE_REGION?.trim() || "auto",
    endpoint,
    forcePathStyle: forcePathStyleRaw !== "false",
  };
}

/** Le stockage est opérationnel si toutes les variables critiques sont présentes. */
export function isStorageConfigured(): boolean {
  const c = getStorageConfig();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

/** Client S3 configuré (style de chemin, credentials applicatifs). */
function createClient(): S3Client {
  const c = getStorageConfig();
  if (!isStorageConfigured()) {
    throw new Error(
      "Stockage non configuré : renseignez STORAGE_ACCOUNT_ID (R2) ou STORAGE_ENDPOINT " +
        "ainsi que STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY et STORAGE_BUCKET.",
    );
  }

  return new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: {
      accessKeyId: c.accessKeyId!,
      secretAccessKey: c.secretAccessKey!,
    },
  });
}

/**
 * Extrait la clé d'objet depuis `products.fileUrl`.
 * Format canonique : `s3://<bucket>/<cle>` (MinIO/R2/S3). Une URL HTTPS directe
 * est également acceptée (on n'utilise alors que son pathname).
 */
export function parseFileUrl(fileUrl: string): { bucket: string | null; key: string } {
  const url = new URL(fileUrl);
  const key = url.pathname.replace(/^\//, "");
  return {
    bucket: url.protocol === "s3:" ? url.hostname : null,
    key,
  };
}

/**
 * Génère une URL pré-signée de téléchargement (SigV4, query-string), TTL court.
 * @param key Clé d'objet S3 (ex. `books/la-mer-des-etoiles.epub`).
 * @param ttlSeconds Durée de validité (900 s = 15 min par défaut).
 */
export async function createPresignedDownloadUrl(key: string, ttlSeconds = 900): Promise<string> {
  const client = createClient();
  const { bucket } = getStorageConfig();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: "attachment",
    }),
    { expiresIn: ttlSeconds },
  );
}

/** Upload d'un objet (utilisé par les scripts de seed des démos). */
export async function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = createClient();
  const { bucket } = getStorageConfig();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Suppression d'un objet (nettoyage de tests / futur back-office). */
export async function deleteObject(key: string): Promise<void> {
  const client = createClient();
  const { bucket } = getStorageConfig();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
