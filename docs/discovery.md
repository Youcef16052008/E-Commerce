# Discovery — Biblio (e-commerce de contenus numériques)

> Date de vérification version : 2026-08-30
> Projet : plateforme e-commerce spécialisée dans les **e-books / licences de contenus numériques**.
> Rôle cible visé : **Développeur Full-Stack Senior**.
> Délai : 4 à 6 semaines. Budget : faible (services gratuits / mode test).

---

## 1. Reformulation du problème

Une plateforme permettant à des **lecteurs / acheteurs de contenus numériques**
de parcourir un catalogue d'ouvrages, de rechercher et filtrer, puis d'acheter
et **télécharger légalement** leurs achats via un compte personnel sécurisé,
pendant que des **administrateurs** gèrent le catalogue, les prix, les fichiers
et les ventes.

C'est un commerce **100 % numérique** : la "livraison" n'est pas physique mais
faisceau de **droits d'accès (entitlements) + fichiers téléchargeables + licence**
attachés au compte de l'acheteur. Aucune gestion de stock physique ni d'expédition.

## 2. Utilisateurs cibles

| Rôle             | Besoins                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| Client           | Rechercher, comparer, acheter, télécharger ses e-books, voir ses commandes.    |
| Administrateur   | Gérer catalogue, prix, fichiers, promos, ventes et utilisateurs.               |
| (Option) Éditeur | Publier des œuvres et suivre ses ventes (peut être uni à l'admin pour le MVP). |

## 3. Scénarios principaux

1. Un visiteur explore le catalogue, cherche et filtre (genre, prix, auteur, langue).
2. Un client crée un compte, ajoute au panier, paye via Stripe (mode test).
3. Le webhook Stripe signé confirme le paiement → l'entitlement est créé → accès au téléchargement.
4. Le client retrouve sa bibliothèque ("mes achats") et télécharge ses fichiers.
5. Un admin crée/modifie un produit, gère les fichiers et voit son tableau de bord.
6. Les routes admin sont strictement protégées (RBAC).

## 4. Contraintes

- Budget faible → hébergement gratuit (Vercel) + base PostgreSQL serverless gratuite (Neon).
- Stripe en **mode test** uniquement (pas de paiement réel).
- Interface **FR** par défaut, **EN** si compatible avec le budget d'effort (i18n restreint).
- Sécurité de bout en bout : webhooks signés, idempotence, RBAC, validation.
- Montrer le signal senior : **le paiement fiable et idempotent** + **la gestion d'entitlements**.

## 5. Risques

- Mauvaise validation du webhook → fausses ventes / accès non mérités.
- Double délivrance (webhooks dupliqués) → transactions incohérentes.
- Stockage de fichiers volumineux → prévoir un stockage objet, pas le FS serveur (offload).
- i18n qui gonfle le scope au MVP → restreindre au FR pour commencer.
- Non-résiliation / revocation des accès si distribué sans DRM → simple lien signature.

## 6. Objectifs mesurables (après déploiement)

- Parcours achat end-to-end testable de bout en bout.
- 100 % des webhooks vérifiés par signature ; 0 accès accordé sans paiement confirmé.
- Aucune double facturation possible (idempotence testée).
- Accessibilité mesurée (travail visé 100), Performance Lighthouse ≥ 90.
- Déploiement sur une URL publique en production.

## 7. Hypothèses

- Pas de DRM ni de protection anti-piratage avancée (cela sort du périmètre MVP).
- Plusieurs licences d'un même produit = 1 fichier téléchargeable (pas de multi-format complexe).
- Un seul modèle de paiement (achat à l'unité), pas d'abonnement au MVP (V2).
- L'auteur/éditeur est géré comme un simple champ, la publication reste côté admin.

## 8. Signal senior principal

> **Fiabilité du pipeline de paiement et délivrance de droits numériques** :
> webhooks Stripe vérifiés, idempotence bout-en-bout (2 couches), transactions,
> RBAC admin, et gestion d'**entitlements** (droits d'accès) — pas un simple "panier demo".
>
> Secondaire : architecture modulaire par features + tests du parcours critique
> (unitaires, intégration, e2e) + README et étude de cas de niveau senior.

## 9. Questions bloquantes (à trancher avant BUILD)

Voir la section "Questions" de la réponse (choix de déploiement, base de données,
mode d'authentification, périmètre DRM/abonnement).
