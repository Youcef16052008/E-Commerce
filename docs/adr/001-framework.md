# ADR-001 — Framework

## Statut
Proposé (à valider).

## Contexte
Boutique e-commerce avec SEO (catalogue public) + back-office + intégration Stripe.
Besoin d'un rendu serveur, d'un déploiement simple et d'une seule app full-stack.

## Options
- **Next.js 16 (Active LTS)** — SSR/SSG, App Router, Turbopack, React 19.2. Version actuelle stable.
- Next.js 15 (Maintenance LTS) — EOL oct 2026 → écarté pour un nouveau projet.
- Nuxt/SvelteKit — bons, mais la stack React/TS est celle ciblée par le portfolio.

## Décision
Next.js 16 (Active LTS), React 19.2, TypeScript strict.

## Conséquences
- Rendus serveur pour le catalogue (SEO), Client Components limités aux interactions (panier, formes).
- Turbopack par défaut. Cache Components à utiliser avec prudence (documenter la fraîcheur).
- Runtime Node ≥ 20.9 ; cibler Node 24 (LTS) en prod.

## Alternatives rejetées
Next.js 15 (EOL proche), Next.js 16 Canary (jamais en prod).
