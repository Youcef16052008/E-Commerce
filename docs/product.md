# Product — Biblio

> Merged from `discovery.md` + `product-brief.md` (2026-09-25, fix-plan L1.2).
> Problem, personas, scope, user stories, acceptance criteria in one place.
> Verified versions: 2026-08-30.

## 1. Problem

Acheter un contenu numérique est un parcours fragmenté : fichiers éparpillés,
perte de sa bibliothèque, absence de preuve d'achat. Biblio rend l'acquisition
**fiable, traçable et ré-accessible** depuis un compte : le cœur du produit
n'est pas « un panier » mais **la délivrance fiable d'un droit d'accès
(entitlement) après un paiement vérifié**.

C'est un commerce **100 % numérique** : la « livraison » = droits d'accès +
fichiers téléchargeables + licence attachés au compte. Aucun stock physique,
aucune expédition.

## 2. Value proposition

- Acheter et **re-télécharger** à tout moment ses ouvrages (bibliothèque personnelle).
- Paiement sûr (Stripe mode test) avec facturation idempotente (jamais de double débit).
- Back-office admin : catalogue, prix, ventes, commandes.
- Délivrance d'**entitlements** plutôt que téléchargement jetable.

## 3. Personas & utilisateurs

| Persona / rôle                   | Besoins                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| **Léa — lectrice occasionnelle** | acheter vite un e-book, le retrouver plus tard                 |
| **Karim — acheteur régulier**    | chercher par genre/langue, comparer, bâtir une bibliothèque    |
| **Nadia — administratrice**      | publier des ouvrages, fixer les prix, suivre les ventes        |
| Client (générique)               | rechercher, comparer, acheter, télécharger, voir ses commandes |
| Administrateur                   | gérer catalogue, prix, fichiers, ventes, utilisateurs          |
| (Option) Éditeur                 | publier et suivre ses ventes — peut être uni à l'admin au MVP  |

## 4. Scénarios principaux

1. Un visiteur explore le catalogue, cherche et filtre (genre, prix, auteur, langue).
2. Un client crée un compte, ajoute au panier, paye via Stripe (mode test).
3. Le webhook Stripe signé confirme le paiement → entitlement créé → accès au téléchargement.
4. Le client retrouve sa bibliothèque et télécharge ses fichiers.
5. Un admin crée/modifie un produit, gère les fichiers et consulte son tableau de bord.
6. Les routes admin sont strictement protégées (RBAC).

## 5. User stories (MVP)

1. Visiteur : parcourir le catalogue, chercher et filtrer.
2. Visiteur : voir le détail d'un ouvrage (prix, auteur, description).
3. Client : créer un compte (email/mot de passe) et se connecter.
4. Client : ajouter des ouvrages à un panier persistant.
5. Client : payer via Stripe (mode test) — le panier se vide à la confirmation.
6. Client : recevoir un **droit d'accès** et télécharger son fichier.
7. Client : retrouver ses achats et l'historique de ses commandes.
8. Admin : créer/modifier/supprimer un produit, gérer le catalogue.
9. Admin : consulter un dashboard (ventes, produits, commandes).
10. Admin : voir les commandes et leur statut.

## 6. Acceptance criteria

- Achat de bout en bout : panier → checkout → **webhook vérifié** → entitlement → téléchargement.
- Aucun accès sans `checkout.session.completed` signé et non déjà traité.
- Routes admin : rôle admin uniquement, refus explicite sinon (403).
- Toute entrée validée (Zod) côté serveur, y compris les routes publiques.
- La bibliothèque ne liste que les produits de l'utilisateur connecté.
- Aucun secret exposé au client.

## 7. Constraints & risks

- Budget faible → Vercel gratuit + Neon (Postgres serverless gratuit) ; Stripe **mode test uniquement**.
- Interface FR par défaut, EN si compatible (décision actuelle : README EN primaire + `README.fr.md`).
- Sécurité de bout en bout : webhooks signés, idempotence, RBAC, validation.
- Risques : webhook non validé → fausses ventes ; double délivrance → incohérences ; fichiers volumineux → stockage objet ; i18n qui gonfle le scope → restreint au MVP ; pas de DRM → liens signés à TTL court.
- Hypothèses : pas de DRM avancé (hors périmètre MVP) ; 1 licence = 1 fichier ; achat à l'unité, pas d'abonnement au MVP ; l'auteur/éditeur est un champ, la publication reste côté admin.

## 8. Hors périmètre (MVP)

DRM · paiement réel (test seulement) · multi-vendeurs · livraison physique ·
abonnements récurrents · stats publiques par livre.

## 9. Fonctionnalités V2

Abonnements/packs/promos · multi-format (EPUB, PDF, MOBI) · comptes éditeurs ·
i18n complet FR/EN · notifications email (reçu, livraison) · historique de
téléchargements + révocation.

## 10. Signal senior

> **Fiabilité du pipeline de paiement et délivrance de droits numériques** :
> webhooks Stripe vérifiés, idempotence bout-en-bout (2 couches), transactions,
> RBAC admin, entitlements — pas un simple « panier demo ».
>
> Secondaire : architecture modulaire par features + tests du parcours critique
> (unitaires, intégration, e2e) + documentation de niveau senior.

## 11. Objectifs mesurables (après déploiement — ne rien inventer)

- Parcours achat end-to-end testable de bout en bout.
- 100 % des webhooks vérifiés par signature ; 0 accès sans paiement confirmé.
- Aucune double facturation possible (idempotence testée).
- Accessibilité mesurée (cible 100), Lighthouse ≥ 90, LCP/INP/CLS suivis.
- Taux de conversion checkout, temps de chargement — **à mesurer après
  déploiement** (Lot 4), jamais estimés.
