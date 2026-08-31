# ADR-006 — Stockage des fichiers & téléchargement

## Statut
Proposé.

## Contexte
Les e-books sont des fichiers volumineux. On ne les sert jamais depuis le serveur
applicatif ni depuis le client (qui ne doit pas détenir de secrets). L'accès doit être
à durée limitée et strictement conditionné à un droit d'achat.

## Décision
- Fichiers hébergés sur un **stockage objet compatible S3 (Cloudflare R2 recomm. / S3)**.
- Le serveur délivre des **URLs pré-signées à TTL court (15 min)** via `aws4fetch` (SigV4).
- **Aucun fichier ne transite par le client ni par le serveur applicatif.**
- L'accès au lien est conditionné à la possession d'un **entitlement** (autorisation objet).

## Conséquences
- `src/server/storage/index.ts` : adaptateur S3 (config via `STORAGE_*`), isStorageConfigured(),
  createPresignedDownloadUrl().
- `POST /api/me/library/[productId]/download` : vérifie l'entitlement (403 sinon), puis
  renvoie l'URL pré-signée (404 si fichier absent, 503 si stockage non configuré).
- Les fichiers sont référencés par `products.fileUrl` (clé objet).

## Alternatives rejetées
- Servir les fichiers depuis le disque du serveur (Vercel/R2) → non-scaling, non adapté.
- Exposer un lien public direct → aucun contrôle d'accès, mauvaise pratique.
- Faire transiter le fichier via le client → fuite de secret / lourd.

## Risques
- R2 gratuit : surveiller les quotas de egress/storage.
- Configurer le CORS du bucket si un upload direct est un jour ajouté (hors périmètre MVP).
