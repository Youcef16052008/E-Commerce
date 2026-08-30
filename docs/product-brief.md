# Product Brief — Biblio

## 1. Résumé exécutif
Biblio est une boutique en ligne d'e-books / licences numériques : catalogue filtreable,
panier persistant, checkout Stripe en mode test, bibliothèque personnelle de téléchargements,
et back-office administrateur. Le cœur du produit n'est pas "un panier" mais **la délivrance
fiable d'un droit d'accès après un paiement vérifié**.

## 2. Problème
Acheter un contenu numérique est un parcours fragmenté : fichiers éparpillés, perte de sa
bibliothèque, absence de preuve d'achat. L'acquisition doit être : fiable, traçable, et
ré-accessible depuis un compte.

## 3. Proposition de valeur
- Acheter et **re-télécharger** à tout moment ses ouvrages depuis une bibliothèque personnelle.
- Paiement sûr (Stripe test) avec facturation idempotente (jamais de double débit).
- Back-office admin pour gérer catalogue, prix et ventes.
- Délivrance d'**entitlements** (droits) plutôt que simple téléchargement jetable.

## 4. Personas
- **Léa — lectrice occasionnelle** : veut acheter vite un e-book et le retrouver plus tard.
- **Karim — acheteur régulier** : recherche par genre/langue, compare les prix, gagne une bibliothèque.
- **Nadia — administratrice** (boutique) : publie des ouvrages, fixe les prix, suit les ventes.

## 5. User stories (MVP)
1. En tant que visiteur, je peux parcourir le catalogue, chercher et filtrer.
2. En tant que visiteur, je peux voir le détail d'un ouvrage (prix, auteur, description).
3. En tant que client, je peux créer un compte (email/mot de passe) et me connecter.
4. En tant que client, je peux ajouter des ouvrages à un panier persistant.
5. En tant que client, je peux payer via Stripe (mode test) et mon panier se vide à la confirmation.
6. En tant que client, je reçois un **droit d'accès** et télécharge mon fichier.
7. En tant que client, je retrouve mes achats et l'historique de mes commandes.
8. En tant qu'admin, je peux créer/modifier/supprimer un produit et gérer le catalogue.
9. En tant qu'admin, je consulte un dashboard (ventes, produits, commandes).
10. En tant qu'admin, je peux voir les commandes et leur statut.

## 6. Fonctionnalités V2
- Abonnements / packs / promos et codes de réduction.
- Multi-format (EPUB, PDF, MOBI) par produit.
- Comptes éditeurs avec suivi des ventes.
- i18n complet FR/EN.
- Notifications par email (reçu, livraison).
- Historique de téléchargements + révocation.

## 7. Hors périmètre (MVP)
- DRM / protection anti-piratage avancée. · Paiement réel (test uniquement).
- Multi-vendeurs / marketplace. · Livraison physique. · Abonnements récurrents.
- Vue publique des "stats" par livre (livraison physique).

## 8. Critères d'acceptation
- Achat de bout en bout : panier → checkout → **webhook vérifié** → entitlement → téléchargement.
- Aucun accès sans `checkout.session.completed` signé et non déjà traité.
- Routes admin accessibles uniquement au rôle admin ; refus explicite sinon (403).
- Toutes les entrées validées (Zod) côté serveur, y compris routes publiques.
- La bibliothèque liste uniquement les produits achetés de l'utilisateur connecté.
- Pas de secret exposé dans le client.

## 9. Métriques de succès (à mesurer après déploiement — ne rien inventer)
- « Résultat à mesurer après déploiement » : taux de conversion checkout, temps de
  téléchargement, temps de chargement LCP/INP, accessibilité Lighthouse.
