# ADR-007 — Catalogue de masse : import Project Gutenberg (Gutendex)

## Statut

Adopté (2026-08-31).

## Contexte

Le catalogue démo (12 produits) est insignifiant pour une librairie. L'utilisateur
souhaite une base de données conséquente « sans tout saisir à la main » et a proposé
de brancher le site sur une bibliothèque externe. Un branchement **en direct**
signifierait : si la source tombe, le site tombe — inacceptable pour un commerce.

## Décision

**Importer** (copier) le catalogue dans la stack de Biblio ; le site ne lit ensuite
**que** sa base et son stockage. La source n'intervient qu'à l'import (ponctuel,
rejouable). Résilience totale : la chute de la source n'a aucun effet sur le site.

- **Source retenue : Project Gutenberg via l'API Gutendex** (`https://gutendex.com/books`,
  sans clé). ~70 000 œuvres **du domaine public (États-Unis)** : fichiers EPUB réels,
  réutilisables/commercialisables légalement (licence stockée par produit).
- **Périmètre initial : les ~500 livres les plus téléchargés**, prix **0,50 USD**
  (`IMPORT_PRICE_CENTS=50`, minimum Stripe), publiés immédiatement.
- `GUTENDEX_BASE_URL` permet de pointer vers un **miroir auto-hébergé** (recommandé par
  Gutendex pour un usage long terme) sans changer de code.
- Les fichiers (EPUB/PDF + couverture) sont téléchargés puis **uploadés dans notre
  stockage objet** : `s3://<bucket>/books/gutenberg/<id>.<ext>` ;
  les couvertures sont servies par notre app (`/api/covers/gutenberg/<id>` → URL
  pré-signée 1 h), jamais par un lien direct vers la source.
- Métadonnées ajoutées à `products` : `source`, `source_id`, `license`, `downloads`
  (migration `drizzle/0002_catalog-import.sql`, additive).
- **Monnaie unique : USD** (Stripe Checkout est mono-devise). Les 12 produits démo
  sont convertis en USD par `npm run seed:products` (idempotent).
- Mapping Gutendex → produit dans `src/features/catalog-import/domain/` (fonctions
  pures, testées) ; orchestrateur dans `application/import-gutendex.ts`.
- **Idempotence** : un produit déjà présent (`source='gutenberg'` + `source_id`)
  est ignoré ; l'import peut être relancé sans doublon.

## Conséquences

- Commande : `npm run import:gutenberg` (variables `IMPORT_*` dans `.env.example`).
- Routes : `GET /api/covers/gutenberg/[id]` (couverture auto-hébergée).
- Tests : 14 tests unitaires mapping + 2 tests orchestrateur (fetch/repo/storage
  stubbés, sans réseau ni base) ; `npm test` total 41 tests verts.
- Recherche/filtres catalogue existants couvrent les nouveaux produits (titre, genre,
  langue, format) sans modification.

## Alternatives rejetées

- **Proxy en direct vers Gutendex/Open Library** → dépendance de disponibilité :
  la panne de la source casse le site.
- **Open Library comme source** → métadonnées seules (CC0) mais **aucun fichier
  vendable** ; API explicitement non destinée à servir de backend de masse.
- **Google Books** → métadonnées + preview, ToS/quota inadaptés à un site commercial.
- **Z-Library / Anna's Archive / LibGen** → contenus piratés : **interdit**, jamais utilisé.
- 10 millions d'objets : inutile et déraisonnable (Go/TB, jours d'import, sans valeur
  ajoutée) ; le catalogue Gutendex complet (70k) reste possible en augmentant la limite.

## Risques

- Gutendex est un service communautaire « best-effort » : utiliser un miroir
  auto-hébergé pour des imports lourds/fréquents, relancer l'import en cas d'échec
  (idempotent).
- Bandwidth/stockage : 500 EPUB ≈ 100–300 Mo (R2 gratuit OK) ; 70k ≈ 20–30 Go (surveiller
  quotas).
- Domaine public : les œuvres PG sont libres aux USA ; la licence est enregistrée par
  produit pour traçabilité.
- `db:push` (ou le SQL `drizzle/0002_catalog-import.sql`) doit être appliqué une fois
  avant `import:gutenberg` (changement additif, sans perte de données).
