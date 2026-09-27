# ADR-008 — Remboursements partiels

## Statut

Adopté (Lot 5, 2026-09-26). Réponse à la question ouverte de l'audit (D-05 / L5.4).

## Contexte

Le remboursement actuel est **intégral et par commande** (ADR-004) :

- `refunds` porte un index unique sur `order_id` ; `reserveFullOrderRefund`
  réserve `orders.total_in_cents` en `refund_pending` avant l'appel Stripe ;
- le webhook `refund.updated` ne fait basculer la commande en `refunded` et ne
  révoque l'entitlement que si **montant, devise et `refundRequestId`**
  correspondent (`refund-repo.ts`, `assertRefundMatches`) ; un remboursement créé
  à la main dans le dashboard Stripe, sans nos métadonnées, est **ignoré**
  (`ignored_unknown_refund`) et remonte dans la page _Exceptions_ via la
  réconciliation ;
- une commande contient N lignes, chacune une **licence personnelle, quantité 1**
  (contrainte `cart_items_personal_license_quantity`), et un entitlement par ligne.

La question : faut-il permettre de rembourser **une ligne** (un livre) ou **un
montant libre** ?

## Décision

1. **Pas de remboursement partiel en phase 1.** Le seul geste commercial est le
   remboursement intégral d'une commande, avec révocation de tous ses droits.
2. Le **montant libre** est écarté définitivement : il casse l'invariant
   « un droit révoqué ⇔ un montant rendu » sur lequel reposent la réconciliation
   et la machine à états. Un geste commercial sans retrait de droit se fait
   **hors Biblio** (coupon, avoir), jamais par un refund Stripe partiel.
3. Le **remboursement par ligne** est la seule extension acceptable. Elle n'est
   pas construite maintenant, mais le code la prépare :
   - le template `renderRefundNotice` (ADR-010) gère déjà `amountCents <
orderTotalCents` et une liste de titres retirés ;
   - `assertRefundMatches` continuerait de vérifier montant = somme des lignes
     remboursées, ce qui exige une table `refund_items(refund_id, product_id,
amount_in_cents)` et la levée de l'unicité `refunds_order_idx` (une commande
     pourrait porter plusieurs refunds, un par sous-ensemble disjoint de lignes).
4. Tout remboursement Stripe qui **n'est pas** l'un des nôtres (montant ≠ total,
   métadonnées absentes) reste une **exception** à traiter à la main, jamais
   appliqué automatiquement.

## Conséquences

- Aucune modification du cœur de paiement (règle permanente n° 1 du fix-plan).
- Le back-office n'expose qu'un bouton « Rembourser la commande » ; la doc
  produit et la page `/legal` (§ 2, _Remboursements_) le disent explicitement.
- Déclencheur de révision : plus de **5 demandes de remboursement par ligne** sur
  un trimestre en production, ou l'arrivée de paniers multi-articles > 3 lignes
  en moyenne. À ce moment, ouvrir une ADR-008-bis avec le schéma `refund_items`.

## Alternatives écartées

- **Montant libre via le dashboard Stripe** : déjà possible techniquement, mais
  volontairement non reconnu par le webhook (voir ci-dessus) ; l'autoriser
  reviendrait à laisser la vérité financière hors de la base.
- **Annuler l'entitlement sans rembourser** (« retrait d'accès disciplinaire ») :
  hors sujet remboursement ; si nécessaire un jour, ce sera un statut
  d'entitlement (`revoked_reason`), pas un refund.
