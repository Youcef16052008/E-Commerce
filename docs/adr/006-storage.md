# ADR-006 — Stockage des fichiers & téléchargement pré-signé

## Statut

Adopté (Slice 5, 2026-08-31).

## Contexte

Les e-books (EPUB/PDF) sont des fichiers que l'on ne sert jamais depuis le serveur
applicatif (scaling, Vercel serverless, latence) ni depuis le client (qui ne doit
détenir aucun secret). L'accès doit être **à durée limitée** et strictement
conditionné à un **droit d'achat** (entitlement) vérifié objet par objet.

Un premier essai avec `aws4fetch` a échoué : ce client signe la requête en **en-tête**
(`Authorization`), pas en **query-string** — MinIO/S3 renvoient donc 403 sur les URLs
renvoyées au navigateur. Le standard pour distribuer des URLs pré-signées au client
est la signature **SigV4 en query-string** (`X-Amz-Algorithm`, `X-Amz-Credential`,
`X-Amz-Signature`…), produite par le SDK AWS officiel.

## Décision

- **MinIO local pour la démo** (S3 compatible, self-hosted) et **Cloudflare R2 en
  production**. Les deux partagent la même API S3 et le même code applicatif.
- Pré-signature via **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`**
  (SigV4 **query-string**, TTL court : **15 min**). L'utilisateur sans droit ne
  reçoit jamais d'URL.
- Config via `STORAGE_*` :
  - `STORAGE_ACCOUNT_ID` (R2) → endpoint déduit
    `https://<account>.r2.cloudflarestorage.com` ;
  - `STORAGE_ENDPOINT` (MinIO self-hosted) → ex. `http://127.0.0.1:9000` ;
  - `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` : utilisateur applicatif
    **dédié** (pas le root) avec policy least-privilege
    `GetObject/PutObject/DeleteObject/ListBucket` sur le bucket des e-books ;
  - `STORAGE_BUCKET` = `biblio`, `STORAGE_REGION` = `us-east-1` (MinIO) / `auto` (R2) ;
  - `STORAGE_FORCE_PATH_STYLE=true` par défaut : format `endpoint/bucket/cle`
    (requis par MinIO, forme canonique de R2).
- `products.file_url` au format **`s3://<bucket>/<cle>`** (ex.
  `s3://biblio/books/la-mer-des-etoiles.epub`) ; la clé est extraite avec
  `new URL(...).pathname.replace(/^\//, '')`.
- Architecture : `src/server/storage/index.ts` est l'unique adaptateur
  (`isStorageConfigured()`, `createPresignedDownloadUrl(key, ttl)`,
  `parseFileUrl()`, `uploadObject()`, `deleteObject()`). Le service applicatif de
  la bibliothèque vérifie l'entitlement **avant** de pré-signer.

## Conséquences

- `POST /api/me/library/[productId]/download` :
  - `401` non connecté ; `403 NOT_ENTITLED` sans achat ; `404 FILE_NOT_AVAILABLE`
    sans fichier ; `503 STORAGE_NOT_CONFIGURED` sans config stockage.
- `GET /api/me/library` + page `/library` (RSC) : liste des ouvrages achetés,
  bouton Télécharger **uniquement si** `file_url` est posé.
- Scripts dev : `npm run books:generate` (EPUB/PDF valides — `mimetype` en premier,
  non compressé), `npm run books:validate` (contrôles zipfile),
  `npm run books:upload` (upload + mapping), `npm run storage:check`
  (upload → pré-signature → GET 200 → intégrité), `bash scripts/setup-minio.sh`
  (MinIO local complet : serveur, bucket, user applicatif, policy, seed).

## Bascule MinIO → R2 (production)

1. Créer un bucket R2 et un jeton API **scopé** (Object Read/Write sur ce bucket).
2. Renseigner `.env` : `STORAGE_ACCOUNT_ID`, `STORAGE_ACCESS_KEY_ID`,
   `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION=auto` ;
   laisser `STORAGE_FORCE_PATH_STYLE=true`.
3. Rejouer `npm run books:upload` (le bucket cible devient R2).
4. Vérifier `npm run storage:check` puis un téléchargement sur `/library`.
   Aucun changement de code : seul `STORAGE_*` change (le format `file_url` reste
   `s3://…`).

## Alternatives rejetées

- `aws4fetch` (signature en en-tête) → 403 sur les URLs renvoyées au navigateur.
- Servir depuis le disque du serveur → non-scaling, inadapté à Vercel/serverless.
- Lien public permanent → aucun contrôle d'accès.
- Faire transiter le fichier par le client → fuite de secret / lourd.
- Upload direct client → secrets exposés, hors périmètre MVP.

## Risques

- R2 : surveiller quotas egress/storage (offre gratuite).
- Secrets `STORAGE_*` : **jamais** commités ni exposés au client (`.env` gitignoré).
- MinIO de démo : credentials root par défaut à changer hors dev.
- CORS bucket : inutile pour le download (GET pré-signé côté navigateur) ; à
  configurer uniquement si un upload direct est ajouté (hors périmètre).
