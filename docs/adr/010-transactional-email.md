# ADR-010 — E-mail transactionnel

## Statut

Adopté (Lot 5, 2026-09-26). Implémenté par L5.1 (`src/server/mail`), câblage
dans les handlers de paiement planifié au Lot 6 (voir _Conséquences_).

## Contexte

L'audit (D-05) relevait qu'un acheteur ne reçoit **aucune trace** de son achat
hors de l'application : pas de reçu, pas d'avis de remboursement. Contraintes du
projet : pas de nouvelle infrastructure (pas de file, pas de worker), payment
core intouchable, déploiement Vercel serverless, plusieurs fournisseurs
possibles selon le pays d'exploitation.

## Décision

1. **Un adaptateur par variable d'environnement**, même modèle que le stockage
   (ADR-006) : `MAIL_PROVIDER = console | resend | postmark | ses`,
   `MAIL_FROM`, `MAIL_API_KEY` (Resend/Postmark) ou credentials AWS (SES).
   `console` est le défaut : journalise, n'envoie rien — dev, CI et sandbox
   restent silencieux sans configuration.
2. **Templates purs** (`templates.ts`) : reçu de commande et avis de
   remboursement (intégral ou partiel, cf. ADR-008), texte brut **et** HTML,
   toute donnée externe échappée, montants formatés depuis les centimes.
3. **Envoi best-effort, hors transaction** : `safeSendReceipt` /
   `safeSendRefundNotice` ne lèvent jamais. Un e-mail perdu ne doit ni faire
   rejouer un webhook Stripe ni annuler un fulfillment. L'idempotence côté
   fournisseur s'appuie sur un `tag` déterministe (`receipt:<orderId>`,
   `refund:<orderId>:<amount>`).
4. **Deux e-mails seulement** : reçu (à `paid`), remboursement (à `refunded`).
   Pas de « bienvenue », pas de relance panier, pas de newsletter — la page
   `/legal` s'y engage (aucune prospection).
5. **Pas de vérification d'e-mail à l'inscription** en phase 1 : un e-mail
   erroné ne fait perdre que le reçu, jamais l'accès (la bibliothèque est la
   source de vérité).

## Conséquences

- **Câblage (Lot 6, L6.1 outbox)** : l'appel sera fait **après commit** dans
  les handlers de `checkout.session.completed` et `refund.updated`, via la table
  _outbox_ drainée par le Cron Vercel — ce qui donne la reprise sur échec sans
  toucher au corps transactionnel. En attendant, aucun mail n'est émis en
  production (l'exploitant le sait : `STATUS.md`).
- Variables à renseigner au lancement : un **domaine expéditeur vérifié** chez
  le fournisseur (SPF/DKIM), `MAIL_FROM` sur ce domaine.
- Si Stripe Tax est adopté (ADR-009 B), le reçu affiche la ligne de taxe ; le
  template prend alors un champ `taxCents` optionnel.
- Tests : 18 tests unitaires sans réseau (`tests/unit/mail.test.ts`) ;
  les providers HTTP sont testés avec un `fetch` factice (en-têtes, corps,
  gestion des erreurs sans fuite de secret).

## Alternatives écartées

- **Stripe « email receipts »** : ne couvre que le paiement (pas le lien vers la
  bibliothèque, pas la révocation), et n'existe pas en mode test.
- **Envoi synchrone dans le webhook** : simple, mais couple la latence du
  fournisseur au délai de réponse à Stripe et mélange échec métier / échec
  d'acheminement.
- **Nodemailer + SMTP** : possible, mais chaque fournisseur ci-dessus expose une
  API HTTPS plus simple à tester et à sécuriser en serverless ; SMTP reste une
  option future via un cinquième provider si un exploitant l'exige.
