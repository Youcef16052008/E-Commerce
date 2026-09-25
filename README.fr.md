# Biblio

Librairie numérique — e-books & licences : catalogue, panier, checkout Stripe
(mode test), bibliothèque personnelle avec téléchargements pré-signés et
back-office administrateur.

**État :** slices 0–9 terminées, CI verte ; **pas encore déployé** — voir
[`STATUS.md`](STATUS.md) · file de travail : [`docs/fix-plan.md`](docs/fix-plan.md) ·
[dépôt GitHub](https://github.com/Youcef16052008/E-Commerce)

## Captures d'écran

|                                                            |                                                  |
| :--------------------------------------------------------: | :----------------------------------------------: |
|          ![Accueil](docs/screenshots/01-home.png)          | ![Catalogue](docs/screenshots/02-catalogue.png)  |
|                         _Accueil_                          |          _Catalogue (12 titres seedés)_          |
|     ![Fiche produit](docs/screenshots/03-product.png)      |     ![Panier](docs/screenshots/05-cart.png)      |
|                      _Fiche produit_                       |      _Panier — checkout Stripe, mode test_       |
| ![Administration](docs/screenshots/06-admin-dashboard.png) | ![Bibliothèque](docs/screenshots/07-library.png) |
|         _Tableau de bord admin (chiffres en base)_         |            _Bibliothèque personnelle_            |

## Pourquoi ce projet est intéressant

- **Le webhook Stripe est la seule source de vérité** — vérification de
  signature sur corps brut, idempotence 2 couches (`Idempotency-Key` + table
  `stripe_events` unique), et enregistrement de l'événement → `paid` →
  entitlements → vidage du panier dans **une seule transaction**.
- **Remboursements pensés pour l'incertitude** — réservation durable
  `refund_pending` avant l'appel Stripe, confirmation uniquement par webhook
  signé, révocation conditionnelle (ADR-004). Les statuts de paiement
  appartiennent à Stripe : seule transition manuelle admin : `paid → fulfilled`.
- **Les fichiers ne transitent jamais par l'application** — contrôle d'entitlement
  puis URL pré-signée SigV4 de 15 min. MinIO en local, Cloudflare R2 en prod,
  même code, bascule par variables d'environnement (ADR-006).
- **Une vraie CI** — service Postgres 17 → migrations → seed → tests
  unitaires/intégration → build → e2e Playwright, sur Node 24.
  `npm run docs:check` casse la CI si le document d'architecture dérive du
  système de fichiers.

## Démarrage rapide

```bash
cp .env.example .env && npm install
npm run db:migrate && npm run seed:all && npm run dev
```

Identifiants de démo, stockage, imports et table complète des commandes :
[`docs/local-dev.md`](docs/local-dev.md).

## Documentation

| Document                                                                                      | Contenu                                                                                  |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`STATUS.md`](STATUS.md)                                                                      | Source unique de vérité : slices, registre de validation, versions                       |
| [`docs/fix-plan.md`](docs/fix-plan.md)                                                        | Défauts d'audit → lots → DoD (la suite)                                                  |
| [`docs/product.md`](docs/product.md)                                                          | Problème, personas, user stories, périmètre                                              |
| [`docs/architecture.md`](docs/architecture.md)                                                | Architecture, ERD, contrats d'API, arborescence                                          |
| [`docs/adr/`](docs/adr/)                                                                      | Décisions structurantes (framework, BDD, auth, paiements, déploiement, stockage, import) |
| [`docs/deploy-preflight.md`](docs/deploy-preflight.md)                                        | Pré-vérifications + `npm run smoke` avant/après chaque déploiement                       |
| [`docs/runbook-deploy.md`](docs/runbook-deploy.md)                                            | Runbook de déploiement Vercel + Neon + R2                                                |
| [`docs/accessibility.md`](docs/accessibility.md) · [`docs/lighthouse.md`](docs/lighthouse.md) | Audit a11y · scores mesurés                                                              |
| [`docs/local-dev.md`](docs/local-dev.md)                                                      | Setup local, commandes, MinIO, import Gutenberg                                          |

## Stack

Next.js 16.3 · React 19.2 · TypeScript strict · Tailwind 4.3 · PostgreSQL 17
(Neon) · Drizzle 0.45 · Better Auth 1.7 · Stripe Checkout 22.6 (mode test,
verrouillé par le code) · Vitest 4 · Playwright 1.62.

## Licence

Code : [MIT](LICENSE). Contenus : les œuvres du domaine public importées depuis
Project Gutenberg gardent leur licence enregistrée par produit (ADR-007) ; les
livres de démo générés sont signalés comme fichiers de démonstration.

English: [`README.md`](README.md)
