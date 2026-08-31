import { AwsClient } from "aws4fetch";

/**
 * Adaptateur de stockage objet (R2 / S3 compatible).
 * Génère des URLs pré-signées à durée limitée pour télécharger un fichier.
 * Les fichiers ne transitent jamais par le serveur applicatif.
 */

function config() {
  const accountId = process.env.STORAGE_ACCOUNT_ID;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.STORAGE_BUCKET;
  const region = process.env.STORAGE_REGION ?? "auto";
  const endpoint = accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : process.env.STORAGE_ENDPOINT;
  return { accountId, accessKeyId, secretAccessKey, bucket, region, endpoint };
}

export function isStorageConfigured(): boolean {
  const c = config();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

/** Renvoie une URL pré-signée (TTL court) pour un objet donné. */
export async function createPresignedDownloadUrl(key: string, ttlSeconds = 900): Promise<string> {
  const c = config();
  if (!isStorageConfigured()) {
    throw new Error("Storage is not configured (missing STORAGE_* env).");
  }

  const url = new URL(`${c.endpoint}/${c.bucket}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));

  // Signature AWS SigV4 via aws4fetch (R2 / S3 compatible).
  const aws = new AwsClient({
    accessKeyId: c.accessKeyId!,
    secretAccessKey: c.secretAccessKey!,
    region: c.region!,
    service: "s3",
  });
  const signed = await aws.sign(new Request(url, { method: "GET" }));
  return signed.url;
}
