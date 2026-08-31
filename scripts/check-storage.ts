/**
 * Vérification bout en bout du stockage objet S3 compatible (MinIO / R2).
 *
 * 1. Upload d'un objet de contrôle (`books/_check-<timestamp>.epub`)
 * 2. Génération d'une URL PRÉ-SIGNÉE (TTL 60 s)
 * 3. GET sur cette URL → vérifie 200, `application/epub+zip` et contenu intact
 * 4. Nettoyage de l'objet
 *
 * Usage : npm run storage:check
 */
import "./load-env";

import { createHash } from "node:crypto";
import {
  createPresignedDownloadUrl,
  deleteObject,
  isStorageConfigured,
  uploadObject,
} from "../src/server/storage";

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  if (!isStorageConfigured()) {
    console.error(
      "✗ STORAGE_* non configurés (.env). Voir .env.example ou `bash scripts/setup-minio.sh`.",
    );
    process.exit(1);
  }

  const key = `books/_check-${Date.now()}.epub`;
  const payload = Buffer.from(
    "PK\u0003\u0004 biblio-storage-check: vérification de téléchargement pré-signé",
    "utf8",
  );

  console.log(`1/4 Upload de ${key}…`);
  await uploadObject(key, payload, "application/epub+zip");

  console.log("2/4 Génération de l'URL pré-signée (TTL 60 s)…");
  const url = await createPresignedDownloadUrl(key, 60);
  const parsed = new URL(url);
  console.log(
    `   ${parsed.pathname}?X-Amz-Algorithm=${parsed.searchParams.get("X-Amz-Algorithm")}…`,
  );
  if (!parsed.searchParams.get("X-Amz-Signature")) {
    throw new Error("URL sans X-Amz-Signature : pré-signature SigV4 invalide.");
  }

  console.log("3/4 GET sur l'URL pré-signée…");
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error(`GET → ${res.status} ${res.statusText} (attendu 200).`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/epub+zip")) {
    throw new Error(`Content-Type inattendu : ${contentType}`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (sha256(body) !== sha256(payload)) {
    throw new Error("Contenu téléchargé différent de l'original (intégrité KO).");
  }

  console.log("4/4 Nettoyage de l'objet de contrôle…");
  await deleteObject(key);

  console.log(
    `\n✓ Stockage OK : 200 ${contentType}, ${body.length} octets, empreinte SHA-256 identique.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
