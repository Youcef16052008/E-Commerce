# ADR-004 — Paiements & délivrance (idempotence 2 couches)

## Statut

Proposé. C'est le cœur du signal senior du projet.

## Contexte

Achat de biens numériques. La confiance ne doit **jamais** reposer sur le client ni sur une
redirection de succès. Le paiement est délivré "at least once".

## Décision

- **Stripe Checkout Sessions** (hébergé, création serveur).
- **Source de vérité = webhook signé** (`checkout.session.completed`), pas l'écran de succès.
- **Signatures** : `stripe.webhooks.constructEvent` sur le **corps brut** (jamais pré-parsé).
- **Idempotence 2 couches** : `Idempotency-Key` à la création de session + table `stripe_events`
  avec `stripeEventId UNIQUE` (ON CONFLICT DO NOTHING) côté réception.
- **Prix relu côté serveur** (jamais depuis le client) ; montants en centimes.

## Conséquences

- Réponse 2xx rapide au webhook, traitement asynchrone, retries Stripe absorbés par idempotence.
- Création `order` + `entitlement` dans une transaction.
- Tests dédiés : doublon de webhook ignoré, montant client falsifié rejeté, accès refusé sans paiement.
- Stripe CLI en local (`stripe listen`) pour tester de vraies charges signées.

## Risques

Vérifier la version d'API Stripe exacte à l'init ; ne pas laisser une version incompatible avec l'SDK.
