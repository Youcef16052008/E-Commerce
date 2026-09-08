# Prérequis juridiques, fiscaux et droits catalogue — Biblio

## 1. Statut juridique de l’exploitant

- **Forme sociale** : micro-entreprise, EURL, SASU, etc. — choisir avant la
  première vente.
- ** Mentions légales** sur le site : dénomination, adresse du siège, RCS/SIRET,
  responsable de publication, email de contact, hébergeur.
- **CGV / CGU** : ventes de biens numériques (e-books) ; distance = contrat
  conclu par « clic » sur Stripe Checkout.
- **Droit de rétractation** : pour les contenus numériques, le droit de
  rétractation **peut être exclu** si l’acheteur a expressément accepté la
  livraison immédiate (art. L221-28 Code consommation). À afficher clairement
  avant paiement.
- **Politique de remboursement** : définir les cas de remboursement (défaut de
  téléchargement, contenu non conforme) et la procédure. Ici : géré via Stripe
  Refunds + webhook `charge.refunded`.

## 2. Fiscalité

- **TVA** :
  - Vendeur établi dans l’UE → TVA selon règles du pays du vendeur (ou OSS si
    seuils dépassés).
  - Vendeur hors UE → ventes hors TVA (TVA due par l’acheteur — auto-liquidation
    B2B, ou TVA perçue par la marketplace selon les seuils locaux).
- **Taxation automatique Stripe** : pour activer la collecte de taxe/TVA au
  checkout, il faut :
  - activer **Stripe Tax** dans le Dashboard ;
  - renseigner l’adresse de l’acheteur (Stripe la collecte via le Checkout) ;
  - ajouter `automatic_tax[enabled]=true` dans `createCheckoutSession` et
    fournir `customer_details` (email + adresse).
  - En mode test, Stripe Tax fonctionne avec des adresses de test spécifiques.
- **Comptabilité** : exporter les événements Stripe (paiements, refunds) et
  rapprocher avec les commandes en base. Service de réconciliation inclus
  (`stripe-reconcile.ts`) + table `stripe_sync_log`.

## 3. Droits catalogue

- **Provenance** : chaque produit en base possède `source`, `source_id`,
  `license` (champs ajoutés par migration 0002).
- **Domaine public** : Project Gutenberg (US) → œuvres sans copyright aux US,
  mais **vérifier les droits dans le pays de commercialisation** (UE : délai
  différent, droits des traducteurs/illustrateurs).
- **Œuvres sous licence** : si des œuvres sous licence CC BY / CC BY-SA sont
  vendues :
  - conserver l’attribution (auteur original, titre, licence) ;
  - ne pas ajouter de restrictions supplémentaires.
- **Contenu original** : si le catalogue inclut des œuvres originales,
  enregistrer les contrats d’auteur / cession de droits.
- **Sécurité juridique** :
  - ne jamais vendre du contenu dont les droits ne sont pas vérifiés ;
  - ne pas utiliser Z-Library / Anna’s Archive / LibGen (contenus piratés) ;
  - garder une trace des licences en base (`products.license`).

## 4. Conformité paiements (Stripe)

- **KYC** : compléter le profil Stripe (identité, activité, IBAN) pour passer en
  mode live.
- **3D Secure** : activé par défaut sur Stripe Checkout (PSD2 SCA pour l’UE).
- **Webhooks signés** : `STRIPE_WEBHOOK_SECRET` obligatoire en prod.
- **Idempotence** : table `stripe_events` + `Idempotency-Key` sur les sessions
  Checkout.
- **Refunds** :
  - gérés côté serveur uniquement ;
  - enregistrés dans la table `refunds` (migration 0005) ;
  - webhook `charge.refunded` → mise à jour atomique du statut commande.

## 5. Vie privée & données

- **RGPD** si l’UE :
  - consentement pour les cookies / emails ;
  - droit d’accès / suppression (Better Auth permet de supprimer le compte) ;
  - mentionner le sous-traitant Stripe (payment processor).
- **Hébergement** : Neon (UE/US selon région choisie), Vercel (CDN global).
- **Données sensibles** : secrets côté serveur uniquement, `.env*` non commité.

## 6. Checklist pré-ouverture

- [ ] Statut juridique déclaré + mentions légales en pied de page.
- [ ] CGV / politique de remboursement publiées.
- [ ] TVA configurée (Stripe Tax + déclarations nationales).
- [ ] Droits catalogue vérifiés (provenance + licence par produit).
- [ ] Stripe KYC complété + compte vérifié pour le mode live.
- [ ] Webhooks configurés (7 événements) + testés en mode test.
- [ ] Réconciliation Stripe / BDD validée (`npm run db:migrate` + test
       `refunds.test.ts`).
- [ ] Sauvegardes base / stockage activées (Neon + R2).
- [ ] Politique de confidentialité + gestion des consentements publiées.
