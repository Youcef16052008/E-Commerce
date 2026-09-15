# Plan de transformation phase par phase — Biblio

**Date :** 7 septembre 2026  
**Base :** `docs/audit-2026-09-07.md`  
**Règle directrice :** ne pas élargir le produit (marketplace, IA, lecteur web, promotions) avant d'avoir rendu un paiement, une délivrance et un remboursement corrects.

> Ce plan est un plan produit/technique. Les sujets de droit, fiscalité, protection des données et conditions de vente nécessitent une validation professionnelle dans le ou les pays de vente.

## Décision de pilotage immédiate

Jusqu'à la fin de la phase 2, choisir explicitement l'un des deux modes :

1. **Portfolio / démonstration** — aucun vrai paiement, bannière persistante, produits clairement marqués démo ; ou
2. **Commerce réel** — seuls des contenus réellement livrables, aux droits vérifiés, peuvent être publiés et le checkout live reste bloqué jusqu'au feu vert de lancement.

Le mode hybride (« contenu démo vendu comme réel ») est interdit.

---

## Vue d'ensemble et jalons

| Phase | Objectif                                                  | Dépend de     | Feu vert obtenu                                       |
| ----- | --------------------------------------------------------- | ------------- | ----------------------------------------------------- |
| 0     | Décider le produit, le mode démo/réel et le cadre légal   | —             | Périmètre irréversible et liste de contenus autorisés |
| 1     | Rendre le paiement et la délivrance financièrement sûrs   | 0             | Démo transactionnelle interne sans bug P0 connu       |
| 2     | Rendre le catalogue et les obligations de vente crédibles | 0, 1          | Catalogue bêta juridiquement/documentairement prêt    |
| 3     | Renforcer comptes, sécurité et opérations                 | 1, 2          | Bêta privée exploitable avec incident response        |
| 4     | Créer une vraie expérience de librairie                   | 2             | Bêta utilisateurs lisible et désirable                |
| 5     | Ajouter découverte, conversion et fidélité                | 3, 4          | Première version publique limitée                     |
| 6     | Outiller l'équipe d'exploitation                          | 1 à 5         | Opérations quotidiennes et support soutenables        |
| 7     | Différencier Biblio                                       | 5, 6          | Produit éditorial distinctif, pas juste un catalogue  |
| 8     | Envisager une marketplace d'auteurs (option)              | 6, 7          | Nouveau produit validé, jamais un simple ajout        |
| 9     | Déploiement, bêta, lancement et amélioration continue     | 1 à 6 minimum | Mise en ligne contrôlée                               |

Les durées dépendent surtout de la disponibilité des contenus, de la validation juridique et des comptes Stripe/R2/Neon. Les phases 0–3 sont des prérequis de fiabilité ; elles ne doivent pas être raccourcies pour faire un beau design plus vite.

---

# Phase 0 — Cadrage produit, contenu et règles de vente

## Objectif

Savoir exactement ce que Biblio vend, à qui, dans quels territoires et pourquoi un lecteur paierait.

## Décisions à prendre

- Choisir le mode **démo** ou **commerce réel**.
- Choisir le positionnement : par exemple « classiques annotés », « livres indépendants francophones », « livres courts pratiques », ou une autre niche précise.
- Définir le titulaire de la boutique, le pays d'immatriculation, les pays servis, la devise, les moyens de paiement et la fiscalité visée.
- Définir la licence achetée : une personne, téléchargement perpétuel ou limité, mises à jour incluses ou non, droit après remboursement.
- Définir les règles pour un fichier numérique : rétractation, consentement explicite avant accès immédiat, remboursement, support, droit d'auteur et retrait de contenu.
- Établir un registre de droits par ouvrage : auteur/ayant droit, contrat ou preuve, territoire, formats, date de vérification et fichiers autorisés.
- Décider si Project Gutenberg est :
  - seulement une source de démonstration non marchande ;
  - une source de textes enrichis à valeur ajoutée ; ou
  - exclu du catalogue commercial tant qu'une revue de droits n'a pas été faite.

## Livrables

- Une page de positionnement d'une page.
- Une liste de 20–50 titres de lancement avec preuve de droits.
- Une politique de contenus interdits et un processus de retrait.
- Une matrice de prix : gratuit, prix TTC, promotions éventuelles, bundles.
- Une décision documentée sur le statut de la démo actuelle.

## Définition de terminé

- Aucun produit publié ne contient un fichier démo présenté comme un ouvrage commercial.
- Chaque produit de lancement possède un propriétaire de droits et une promesse client vérifiables.
- Le checkout live reste désactivé si la décision commerciale et les textes contractuels ne sont pas validés.

---

# Phase 1 — Intégrité du paiement, de la commande et de la délivrance (P0)

## Objectif

Garantir qu'un paiement valide donne exactement les droits achetés, une seule fois ; qu'aucun panier récent n'est effacé par erreur ; et qu'un remboursement Stripe est réellement un remboursement.

## 1.1 Repenser le modèle de commande

Créer une migration additive (ne pas modifier silencieusement les données existantes) pour introduire au minimum :

- `stripeCheckoutSessionId` unique ;
- `stripePaymentIntentId` unique lorsque disponible ;
- montant HT/sous-total, montant de taxe, total, devise et snapshots ;
- expiration de checkout ;
- état de paiement et état de délivrance séparés, ou une machine à états équivalente documentée ;
- identifiants, montant, raison, initiateur et dates de remboursement ;
- état durable des événements Stripe (`processing`, `completed`, `failed`, nombre de tentatives, erreur technique non sensible).

Ajouter des contraintes PostgreSQL, pas seulement Zod/TypeScript :

- quantité valide ;
- prix non négatif et compatible avec le modèle choisi ;
- devise validée ;
- états valides ;
- `UNIQUE(source, source_id)` pour les imports ;
- suppression de l'index unique redondant de `stripe_events` après migration sûre.

## 1.2 Corriger le modèle de licence numérique

**Décision recommandée pour le MVP : une licence personnelle par produit.**

- Supprimer les boutons quantité du panier et imposer `quantity = 1`.
- Empêcher l'ajout d'un livre déjà détenu.
- Revalider au checkout qu'aucun droit n'existe déjà.
- Retourner un code explicite `ALREADY_OWNED` et proposer le lien vers `/library`.
- Si des licences multiples sont souhaitées plus tard, créer un produit séparé « licences équipe » avec sièges et bénéficiaires : ne pas réutiliser la quantité d'un panier B2C.

## 1.3 Rendre le checkout concurrent et rejouable

- Ne jamais supprimer toutes les commandes `pending` lors d'un nouveau checkout.
- Lier immédiatement une intention de paiement à une commande et conserver les intentions expirées/cancelled pour audit.
- Prévenir le double clic client, mais surtout protéger le serveur avec une clé d'idempotence représentant l'intention de checkout.
- Ne supprimer du panier que les lignes de la commande payée ; conserver tout ajout fait après le lancement d'un checkout, notamment dans un autre onglet.
- Gérer `checkout.session.expired`, annulation et échecs asynchrones sans supprimer l'historique.

## 1.4 Corriger le webhook Stripe

- Vérifier signature, type, statut de paiement, montant, devise et lien commande/session/payment intent.
- Traiter la réservation de l'événement, la mise à jour de commande et la création des entitlements dans une transaction atomique ou dans un workflow à états rejouable.
- Un événement qui n'a pas réellement délivré doit rester rejouable et provoquer une réponse Stripe appropriée.
- Prévoir une vue admin « paiements à examiner » ; ne pas répondre silencieusement 200 sur une commande inconnue ou un montant incohérent.
- Ajouter une réconciliation périodique entre Stripe et la base : paiements Stripe réussis sans entitlement, commandes paid sans payment intent, remboursements non reflétés.

## 1.5 Vrais remboursements

- Remplacer le changement local de statut par un appel Stripe idempotent à partir du Payment Intent/Charge enregistré.
- Mettre l'ordre en `refund_pending` jusqu'au webhook Stripe de confirmation.
- Révoquer les droits seulement selon la règle commerciale décidée et après confirmation fiable.
- Conserver un journal d'audit : admin, motif, date, montant et identifiant Stripe.
- Retirer du back-office les transitions manuelles financières (`pending → paid`, `paid → refunded`) tant que ce workflow n'est pas prêt.

## Tests obligatoires

- Quantité 2, rachat d'un livre déjà détenu, panier de licence équipe si cette fonction existe.
- Double clic checkout, deux onglets, paiement d'une session A après création d'une session B.
- Ajout d'un second article pendant le paiement du premier.
- Échec de transaction après réservation de l'événement webhook puis retry Stripe.
- Événement dupliqué, montant/devise/session inconnus, paiement différé, session expirée.
- Remboursement complet, répétition de remboursement, achat doublon, échec Stripe et webhook de remboursement.
- Tests d'intégration sur PostgreSQL éphémère en CI ; tests e2e avec Stripe test ou mocks stricts.

## Définition de terminé

- Aucun scénario de test ne peut facturer sans entitlement correspondant.
- Le nombre de licences délivrées correspond exactement au modèle de vente.
- Les retries d'un webhook sont sûrs et récupèrent une panne temporaire.
- L'admin ne peut pas faire croire à un paiement/remboursement sans la source de vérité Stripe.
- La réconciliation identifie automatiquement les écarts.

---

# Phase 2 — Catalogue réel, médias et conformité de vente

## Objectif

Faire en sorte que chaque fiche corresponde à un vrai produit livrable et que la boutique explique honnêtement ses règles.

## Chantiers

### Contenu et médias

- Supprimer les contenus fictifs payants, ou les rendre explicitement gratuits et marqués démo.
- Remplacer les emojis de couverture par de vraies couvertures autorisées et homogènes.
- Créer un workflow admin d'upload contrôlé : fichier source, couverture, type MIME, extension, taille, checksum, scan antivirus si nécessaire et stockage R2/S3.
- Ne plus accepter une URL arbitraire HTTP(S) comme `fileUrl` : enregistrer une clé interne S3 versionnée.
- Conserver pour chaque édition : version, formats, langue, taille, pages ou durée, compatibilité, extrait et date de publication.
- Pour les imports, contrôler copyright, source, fichier, checksum et licence avant publication ; rendre l'import concurrent idempotent en base.

### Transparence et textes légaux

- Ajouter un footer avec identité du vendeur, contact/support, CGV, confidentialité, cookies, remboursements, copyright/takedown et accessibilité.
- Intégrer au checkout le consentement requis pour la fourniture immédiate de contenu numérique, selon le droit applicable.
- Définir le traitement des données : durée de conservation, demandes d'accès/suppression, sous-traitants Stripe/R2/Neon/Vercel.
- Mettre à disposition reçu/facture et politique claire pour les échecs de téléchargement.

## Définition de terminé

- Une fiche produit répond, sans ambiguïté, à « qu'est-ce que j'achète ? », « est-ce compatible ? », « qui l'a créé ? », « quels droits ai-je ? » et « comment obtenir de l'aide ? ».
- Tout produit publié a un fichier réellement téléchargeable depuis le stockage de production et une preuve de droit dans le registre interne.
- Toutes les pages de confiance sont accessibles depuis toutes les pages publiques.

---

# Phase 3 — Comptes, sécurité, observabilité et exploitation

## Objectif

Permettre à une petite équipe d'exploiter Biblio sans dépendre de logs manuels ni d'un compte admin à mot de passe public.

## Chantiers

### Comptes et accès

- Vérification d'email, reset de mot de passe, changement de mot de passe, page compte et demande de suppression/export de données.
- Mot de passe robuste côté serveur ; messages de connexion volontairement génériques.
- MFA obligatoire pour les admins, sessions admin courtes et journal des actions sensibles.
- En production, rendre obligatoires `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` et `SEED_ADMIN_PASSWORD`; interdire les valeurs de démonstration.
- Corriger le validateur de redirection post-login avec une URL normalisée et même origine.

### Défense applicative

- Ajouter une Content Security Policy testée ; ne charger les médias que depuis les domaines/stockages autorisés.
- Vérifier les protections CSRF/origine des routes d'écriture et les cookies en production.
- Ajouter rate limit distribué sur auth et actions sensibles, pas seulement une limite locale de processus.
- Vérifier chaque configuration Preview/Production : domaine auth, Stripe live/test, R2, secrets, HSTS et erreurs.
- Réduire les permissions R2/S3 au strict nécessaire et faire tourner les secrets selon un calendrier.

### Observabilité et continuité

- Centraliser exceptions et traces (Sentry ou équivalent), sans secrets ni contenu privé dans les événements.
- Alertes sur webhook Stripe en erreur, écart de réconciliation, erreurs 5xx, téléchargement impossible et latence DB.
- Sauvegardes/restauration Neon, procédure d'incident, runbook de support et exercice de rollback.
- Ajouter audit de dépendances et seuil de couverture dans la CI ; corriger l'avertissement Vite lié à `__dirname`.

## Définition de terminé

- Un client peut récupérer son compte sans intervention humaine.
- Les actions admin et paiements anormaux sont attribuables et alertés.
- Une panne de paiement, de stockage ou de DB a un propriétaire, une alerte, un diagnostic et une procédure de rattrapage.

---

# Phase 4 — Identité visuelle et parcours de librairie

## Objectif

Faire passer Biblio de « démonstration propre » à « librairie dans laquelle on a envie de choisir un livre ».

## Chantiers

### Design system

- Définir logo/wordmark, couleurs, échelles typographiques, composants, icônes, espacements et états de focus/erreur/chargement.
- Employer une typographie éditoriale pour titres/livres et une typographie d'interface pour navigation/formulaires.
- Finaliser un thème sombre cohérent ou retirer le dark mode automatique incomplet.
- Produire des maquettes desktop et mobile avant implémentation.

### Pages publiques

- Refaire l'accueil : sélection éditoriale, catégories, nouveautés, meilleures ventes, bénéfices, fonctionnement, réassurance et footer.
- Refaire la carte produit : couverture dominante, badges langue/format, auteur, prix, état de possession et aperçu.
- Refaire la fiche : extrait, métadonnées complètes, compatibilité, auteur/éditeur, licence, support, recommandations et CTA mobile.
- Rendre le header mobile concis ; éviter que navigation, compte et actions se battent sur une petite largeur.
- Utiliser des images optimisées et des alternatives accessibles ; tester le contraste et le clavier sur le design final.

## Définition de terminé

- Un nouveau visiteur comprend la niche de Biblio en moins de dix secondes.
- Chaque produit est reconnaissable visuellement avant la lecture de son titre.
- Le parcours mobile catalogue → fiche → bibliothèque est vérifié sur appareils réels ou émulateurs représentatifs.

---

# Phase 5 — Découverte, conversion et fidélité

## Objectif

Aider un lecteur à trouver un livre pertinent, à décider sans pression et à revenir après son premier achat.

## Chantiers

- Terminer les filtres annoncés : langue, format, prix, thématique ; conserver des URLs partageables.
- Ajouter recherche performante : index trigramme/full-text, tolérance aux accents et suggestions si aucun résultat.
- Créer pages catégories/auteurs/collections et sélections éditoriales manuelles.
- Wishlist/favoris, « récemment consultés », livres déjà possédés et sauvegarde pour plus tard.
- Recommandations simples et explicables (« même auteur », « même genre », « dans cette collection »), pas d'algorithme opaque initialement.
- Emails transactionnels : vérification, reçu, paiement confirmé, téléchargement disponible, remboursement et support.
- SEO : sitemap, robots, canonical, Open Graph et JSON-LD `Book`/`Product`; ne publier que des métadonnées exactes.
- Analytics respectueuse du consentement : rechercher, consulter une fiche, ajouter, commencer checkout, paiement confirmé, téléchargement réussi, demande support.

## Indicateurs à mesurer

- recherche sans résultat ;
- vue fiche → ajout panier ;
- ajout panier → checkout ;
- checkout → paiement confirmé ;
- paiement → premier téléchargement réussi ;
- tickets support par 100 commandes ;
- taux de rachat et d'ajout en favoris.

## Définition de terminé

- Aucun indicateur n'est inventé : chaque donnée est produite par un événement documenté.
- Les mesures ne dégradent ni confidentialité, ni performance, ni accessibilité.

---

# Phase 6 — Back-office et opérations quotidiennes

## Objectif

Permettre de gérer catalogue, clients, incidents et comptabilité à mesure que le volume augmente.

## Chantiers

- Pagination, recherche, filtres et export CSV des commandes admin.
- Détail de commande : éléments figés, statut Stripe, timeline d'événements, téléchargements, remboursements, notes support et audit.
- Back-office catalogue : brouillon/prévisualisation/publication planifiée, médias internes, validation avant publication, gestion de versions de fichier.
- Gestion de clients : demandes support, renvoi de reçu, aide au téléchargement, export/suppression conformément aux règles décidées.
- Rapports : ventes nettes, taxes, remboursements, livres les plus consultés/vendus, erreurs de délivrance.
- Rôles internes distincts si besoin (support, éditeur, finance), en permissions minimales ; l'admin unique est insuffisant à terme.

## Définition de terminé

- Une personne support peut résoudre un incident client sans accès direct à la base de données.
- L'équipe peut expliquer et prouver l'historique d'un paiement, d'un accès et d'un remboursement.

---

# Phase 7 — Différenciation éditoriale

## Objectif

Donner une raison forte de choisir Biblio plutôt qu'un fichier gratuit, une grande marketplace ou une plateforme généraliste.

## Options à valider avec de vrais lecteurs

- Collections françaises éditées par thème et non seulement par algorithme.
- Œuvres du domaine public enrichies légalement : nouvelles couvertures, notes, cartes, glossaires, guides de lecture, introduction originale, formats accessibles.
- Livres d'auteurs indépendants avec vraie identité, biographie, pages auteur et soutien transparent.
- Cadeaux : code cadeau, dédicace, message, bundle de lecture.
- Lecteur web accessible, marque-pages et progression, seulement lorsque les droits et l'infrastructure sont prêts.
- Audio, traduction ou édition bilingue seulement avec contrats et contrôles de qualité adaptés.

## Définition de terminé

- Chaque fonctionnalité est reliée à une hypothèse mesurable de valeur lecteur ou revenu, pas à une imitation d'Etsy ou Spreadshirt.

---

# Phase 8 — Marketplace d'auteurs (facultatif et séparé)

## Principe

Une marketplace n'est pas la « phase suivante » naturelle : c'est un nouveau produit à deux côtés (lecteurs et vendeurs). Ne la démarrer qu'après validation de la librairie mono-vendeur.

## Préconditions

- Catalogue éditorial rentable ou engagement lecteur réel.
- Support, facturation, réconciliation et modération déjà fiables.
- Politique de contenu et de droits appliquée à grande échelle.

## Travail nécessaire

- Onboarding auteur/éditeur, profil boutique/auteur, contrats et vérification d'identité.
- Publication avec contrôle des droits, anti-piratage, modération et procédure de contestation.
- Reversements, commissions, Stripe Connect ou équivalent, KYC, taxes et factures multi-vendeurs.
- Dashboard créateur : ventes, téléchargements, revenus, contenu, support et rapports.
- Avis acheteur, signalement, messagerie encadrée et prévention fraude.

## Décision de sortie

Ne lancer cette phase que si le coût légal/opérationnel est financé et si une dizaine de créateurs sérieux ont un besoin confirmé.

---

# Phase 9 — Déploiement, bêta et lancement contrôlé

## 9.1 Environnements

- Séparer local, test, preview, staging et production.
- Utiliser une base et un bucket distincts par environnement.
- Configurer Neon, R2/S3, Vercel, domaine, Better Auth et Stripe avec secrets distincts.
- Ne passer Stripe en live que lorsque les phases 1, 2 et 3 ont reçu leur feu vert.

## 9.2 Bêta privée

- Inviter un petit groupe de testeurs avec contenus gratuits ou coupons contrôlés.
- Tester sur mobile, réseaux lents, compte oublié, achat, délivrance, re-téléchargement, support et remboursement test.
- Organiser un exercice : panne du webhook, fichier absent, remboursement, compte bloqué, rollback de déploiement.
- Corriger les problèmes avant d'augmenter l'audience ; ne pas mesurer uniquement les clics, lire les tickets et observer les abandons.

## 9.3 Lancement progressif

- Catalogue limité et vérifié.
- Limite de dépenses/support au début.
- Monitoring actif les premiers jours.
- Revue quotidienne : paiements Stripe, entitlements, téléchargements, erreurs et tickets.
- Retour arrière possible sans migration destructive.

## Feu vert final de lancement

- Tests P0 verts en CI et staging.
- Réconciliation Stripe sans écart connu.
- Aucun contenu de démonstration vendu comme réel.
- Pages légales/support publiées et validées pour le périmètre choisi.
- Sauvegarde, alertes, rollback et responsable d'incident opérationnels.
- Parcours mobile et accessibilité vérifiés avec le design final.

---

# Ordre concret du prochain backlog

## Lot A — à faire maintenant, avant design ou marketplace

1. Ajouter une bannière de mode démo et désactiver Stripe live, **ou** retirer les faux produits de vente.
2. Écrire les tests de régression P0 (quantité, rachat, double checkout, webhook après échec, panier multi-onglet, remboursement).
3. Concevoir la migration commandes/paiements/événements Stripe.
4. Corriger le workflow webhook + checkout + entitlement dans une même séquence de livraison.
5. Supprimer les transitions financières manuelles et préparer le vrai remboursement Stripe.
6. Ajouter la réconciliation et la page admin des exceptions.

## Lot B — juste après la sûreté transactionnelle

1. Définir les 20–50 vrais produits et le registre de droits.
2. Construire l'upload média interne et remplacer les URL de fichier arbitraires.
3. Ajouter footer, support, conditions et confidentialité.
4. Mettre en place comptes récupérables, MFA admin, CSP et observabilité.

## Lot C — seulement ensuite

1. Refonte de l'identité, accueil, cartes, fiches et mobile.
2. Recherche/collections/favoris/emails/SEO.
3. Dashboard support et reporting.
4. Fonctionnalités distinctives de lecture.

---

## Ce qui ne doit pas être fait maintenant

- Marketplace d'auteurs et reversements.
- IA de recommandation ou personnalisation complexe.
- Plusieurs devises et plusieurs pays sans modèle fiscal.
- Promotions/coupons avant des prix, taxes et remboursements fiables.
- Lecteur web ou DRM avant le catalogue et les droits.
- Accumuler 70 000 titres Gutenberg avant d'avoir une proposition de valeur et une revue juridique.

## Première décision recommandée

Traiter Biblio comme **une démo portfolio sécurisée mais non commerciale** jusqu'à la validation de la phase 1 et de la phase 2. Puis lancer une bêta avec un petit catalogue réellement différencié. C'est le chemin le plus sûr pour passer d'un bon projet de développeur à un vrai produit e-commerce.
