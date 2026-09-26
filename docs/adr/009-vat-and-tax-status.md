# ADR-009 — TVA et statut fiscal de la boutique

## Statut

Adopté pour la phase 1 (Lot 5, 2026-09-26) : **aucune taxe collectée tant que la
boutique est en mode test**. Le choix du régime réel est un **prérequis de
lancement** documenté ici, à trancher avec un expert-comptable avant la première
clé `sk_live_`.

## Contexte

- Le code **refuse toute clé Stripe live** (`src/server/payments/stripe.ts`) :
  aucun argent réel ne circule, donc aucune TVA n'est exigible aujourd'hui.
- `STRIPE_TAX_CODE` est vide par défaut : Stripe _Managed Payments_ est
  désactivé sur la session Checkout, prix affichés en USD « tels quels ».
- Les produits sont des **services électroniques B2C** (livres numériques
  téléchargés). Dans l'UE, la TVA sur ces services est due **dans le pays du
  client** (régime OSS), avec une franchise de 10 000 € HT/an pour un vendeur
  établi dans un seul État membre ; un vendeur établi **hors UE** vendant à des
  consommateurs européens doit collecter dès le premier euro (guichet OSS
  non-UE). Les livres numériques bénéficient de taux réduits variables selon
  les pays (5,5 % en France).
- L'exploitant du projet n'a pas encore fixé sa structure juridique ni son pays
  d'établissement : **cette ADR ne présume ni l'un ni l'autre**.

## Décision

1. **Phase 1 (mode test)** : pas de collecte, pas de mention de TVA sur les
   reçus ; la page `/legal` indique « toutes taxes comprises le cas échéant » et
   que la boutique est en mode test.
2. **Prérequis de lancement** (bloquant, à cocher dans `docs/runbook-deploy.md`
   §1 avant toute clé live) — choisir **une** des trois voies :
   - **(A) Micro-entreprise française en franchise en base** (art. 293 B CGI) :
     pas de TVA facturée, mention obligatoire « TVA non applicable, art. 293 B du
     CGI » sur les reçus, **mais** la franchise ne dispense pas de l'OSS pour les
     ventes B2C de services électroniques à d'autres États membres au-delà de
     10 000 €/an. Convient à un démarrage à faible volume.
   - **(B) Stripe Tax** : `STRIPE_TAX_CODE=txcd_10302000` (livres numériques),
     `automatic_tax` activé, immatriculation OSS faite par l'exploitant, Stripe
     calcule et ventile ; les reçus (ADR-010) doivent alors afficher la ligne de
     taxe fournie par Stripe (`total_details.amount_tax`).
   - **(C) Vendeur hors UE** : immatriculation OSS non-UE ou décision de **ne
     pas vendre aux consommateurs de l'UE** (géoblocage à l'adresse de
     facturation Stripe). Cette option doit être explicite, pas par défaut.
3. Dans tous les cas : **prix TTC affichés** (obligation B2C), montants stockés en
   centimes, et la devise unique USD reste jusqu'à ce que le régime choisi
   impose l'euro (contrainte `orders_currency_usd` à lever par migration à ce
   moment-là).

## Conséquences

- Aucune modification de code en phase 1 ; les points d'accroche existent
  (`STRIPE_TAX_CODE`, templates de reçu).
- Le `STATUS.md` post-déploiement gagne une ligne « Régime TVA choisi : A/B/C,
  validé par … le … » — sans elle, pas de clé live.
- Si (B) est retenu, ADR-004 (paiements) reçoit un addendum : le montant
  remboursé inclut la taxe et Stripe Tax émet la régularisation.

## Alternatives écartées

- **Coder un moteur de TVA maison** (table de taux par pays) : hors périmètre,
  fragile, redondant avec Stripe Tax.
- **Ignorer la question jusqu'à la première vente réelle** : c'est exactement le
  défaut relevé par l'audit ; l'ADR existe pour que la décision soit prise
  _avant_ l'argent réel.
