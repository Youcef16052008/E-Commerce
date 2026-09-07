# ADR-004 — Paiements & délivrance (idempotence 2 couches)

## Statut

Proposé. C'est le cœur du signal senior du projet.

## Contexte

Achat de biens numériques. La confiance ne doit **jamais** reposer sur le client ni sur une
redirection de succès. Le paiement est délivré "at least once".

## Décision

- **Stripe Checkout Sessions** (hébergé, création serveur).
- **Source de vérité = webhooks Stripe signés** (`checkout.session.completed` ou
  `checkout.session.async_payment_succeeded`), pas l'écran de succès. Les échecs
  async et l'expiration de session sont aussi consommés.
- **Signatures** : `stripe.webhooks.constructEvent` sur le **corps brut** (jamais pré-parsé).
- **Idempotence 2 couches** : fingerprint déterministe de panier → ordre pending
  unique → `Idempotency-Key` Stripe lié à l'ordre ; table `stripe_events` avec
  `stripeEventId UNIQUE` côté réception.
- **Prix relu côté serveur** (jamais depuis le client), devise et montant Stripe
  comparés à l'ordre ; montants en centimes.
- Une licence numérique est personnelle : quantité forcée à 1 et rachat bloqué
  lorsqu'un entitlement existe.
- `stripe_events`, `paid`, les entitlements et le retrait des seules lignes de
  panier acquittées sont écrits dans **une transaction unique**.

## Conséquences

- Le webhook est traité **avant** la réponse HTTP. Une anomalie ou une erreur
  transactionnelle reçoit un 5xx afin que Stripe le rejoue ; l'event n'est alors
  pas durablement marqué comme traité.
- L'ordre stocke son fingerprint, l'identifiant de Checkout, le Payment Intent
  et l'expiration. Un clic répété reprend la session ouverte ; une session
  expirée laisse une commande auditable et permet une nouvelle intention.
- L'admin ne peut pas simuler un paiement ou un remboursement localement. Un
  remboursement ne sera affiché qu'après un workflow Stripe dédié et ses
  webhooks.
- Tests dédiés : doublon/rejeu de webhook, montant ou client incohérent, panier
  multi-onglet ciblé, quantité/rachat et concurrence d'intention.
- Stripe CLI en local (`stripe listen`) pour tester de vraies charges signées.

## Risques

Vérifier la version d'API Stripe exacte à l'init ; ne pas laisser une version incompatible avec l'SDK.
