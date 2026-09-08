# MCP opérateur — Stripe et Playwright

Ce dépôt installe les serveurs MCP officiels ci-dessous comme dépendances de développement,
pour une version reproductible :

| Serveur    | Paquet            | Version  | Usage                                                                      |
| ---------- | ----------------- | -------- | -------------------------------------------------------------------------- |
| Stripe     | `@stripe/mcp`     | `0.3.3`  | consulter/configurer Stripe avec une clé restreinte ou OAuth du client MCP |
| Playwright | `@playwright/mcp` | `0.0.80` | parcours navigateur exploratoires et contrôle d'interface                  |

## Configuration sans secret

1. Copier le modèle, qui ne contient aucune clé :

   ```bash
   cp .mcp.json.example .mcp.json
   ```

2. Enregistrer ce fichier dans le client MCP utilisé par l'opérateur. Les hôtes MCP
   n'adoptent pas tous automatiquement le fichier projet : reprendre les deux entrées
   `mcpServers` dans leur configuration si nécessaire.
3. Ne jamais commiter `.mcp.json`, une clé Stripe, un export de session de navigateur
   ou un état Playwright ; le fichier local est ignoré par Git.

Les commandes de vérification sont :

```bash
npm run mcp:stripe      # requiert STRIPE_SECRET_KEY dans l'environnement du client
npm run mcp:playwright  # serveur stdio, Chromium headless isolé
```

## Règle Stripe : test d'abord, privilège minimal

Pour le serveur local Stripe, injecter dans l'environnement **du client MCP** une
clé restreinte (`rk_test_…` d'abord, puis éventuellement `rk_live_…`). Ne jamais
placer une clé dans ce dépôt ou dans une commande shell enregistrée. Limiter la clé
aux opérations requises et à l'environnement voulu :

- **test/staging** : lecture, création/suppression de l'endpoint de test et objets de
  test nécessaires au smoke test ;
- **live** : lecture par défaut. Élever temporairement et explicitement les droits
  seulement pour créer/modifier l'endpoint webhook après validation du propriétaire.

Le serveur Stripe peut aussi être utilisé via le serveur officiel distant
`https://mcp.stripe.com` si le client MCP sait faire OAuth. Cette méthode évite de
manipuler une clé locale dans la configuration.

## Procédure d'activation contrôlée

L'ordre est volontairement strict ; ne jamais utiliser `db:push` en production.

1. **Base isolée** — fournir une `DATABASE_URL` dédiée et non productive, appliquer
   `npm run db:migrate`, puis exécuter `npm run test:integration` avec cette même URL.
   Le jeu de tests écrit et nettoie ses propres données : elle ne doit jamais viser une
   base de production.
2. **Stripe test** — créer ou vérifier l'endpoint
   `https://<domaine-test>/api/webhooks/stripe` et souscrire exactement :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`

   Reporter le signing secret de cet endpoint uniquement dans le gestionnaire de secrets
   de l'environnement test sous `STRIPE_WEBHOOK_SECRET`. Faire un achat test complet,
   un retry webhook et une session expirée.

3. **Revue de passage live** — le titulaire valide par écrit : identité/entité qui vend,
   pays et territoires, droits de chaque e-book, Conditions de vente, confidentialité,
   retours/remboursements, fiscalité/TVA et support client. Les remboursements Stripe
   réels et leur réconciliation restent à développer et à tester avant d'accepter de
   l'argent réel.
4. **Production** — après cette revue et un backup vérifié : lancer
   `DATABASE_URL=<url-production> npm run db:migrate` depuis le pipeline/deploiement
   autorisé, vérifier le schéma, puis créer un endpoint webhook **live** avec les mêmes
   quatre événements. Stocker son secret live dans le gestionnaire de secrets, déployer,
   et faire un test de paiement live à faible montant suivi de sa réconciliation.

Le fichier `docs/runbook-deploy.md` contient les variables et la checklist de
production. Cette procédure ne transforme pas Stripe en live tant que les critères de
l'étape 3 et le workflow de remboursement réel ne sont pas achevés.
