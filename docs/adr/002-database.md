# ADR-002 — Base de données & accès

## Statut

Proposé.

## Contexte

Données transactionnelles (commandes, paiements, entitlements) + fonctionnement serverless.
Il faut des transactions ACID et un accès SQL précis.

## Options

- **PostgreSQL 17 (Neon)** + **Drizzle** — relationnel robuste, JSONB, transactions. Drizzle : SQL
  explicite, bundle ~57KB, natif Neon/Edge, pas de codegen, 100% OSS.
- Prisma 7 — schema-first, migrations/génération de types très matures, mais bundle plus lourd et
  moins de contrôle SQL direct.

## Décision

PostgreSQL 17 via Neon + Drizzle. Schéma versionné en migrations.

## Conséquences

- Clé idempotence : contrainte UNIQUE sur `stripe_events.stripeEventId` (ON CONFLICT DO NOTHING).
- Prix en centimes (int). Transactions pour création commande + entitlement.
- Épinger les versions (pré-1.0).

## Alternatives rejetées

Prisma 7 (choix valide, mais Drizzle colle mieux au besoin de contrôle SQL + Neon + poids réduit).
Sujet réversible : l'accès reste isolé derrière `src/server/db`.
