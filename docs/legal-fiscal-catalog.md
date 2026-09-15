# Préconditions juridiques, fiscales et de catalogue — Biblio

**Statut : bloquant avant toute clé Stripe live.** Ce document est une checklist
opérationnelle, pas un avis juridique, fiscal ou comptable. L’exploitant doit faire
valider les pays effectivement servis et son statut par des professionnels compétents.
Biblio reste techniquement limité à Stripe **test** à ce stade.

## 1. Décisions que le propriétaire doit prendre par écrit

Avant toute vente, consigner dans un registre interne :

1. l’entité qui vend (personne/forme, adresse, immatriculation, responsable et contact
   support) ;
2. le pays d’établissement, les territoires de vente et les devises réellement servis ;
3. le modèle commercial (vente d’une licence personnelle, durée de l’accès, appareils,
   mises à jour, règles après remboursement) ;
4. le rôle de Stripe et les prestataires qui traitent des données ;
5. le délai de réponse support et les règles applicables aux téléchargements défaillants,
   contenus indisponibles, remboursements et fraude.

Ne pas afficher « disponible dans le monde entier » tant que les obligations par pays,
la fiscalité et les moyens de paiement n’ont pas été validés.

## 2. Si l’activité ou le contrat relève de l’Algérie

Le lieu exact de l’exploitant reste à confirmer. Lorsque la loi algérienne s’applique,
la loi n° 18-05 du 10 mai 2018 relative au commerce électronique doit être relue avec
un conseil local : elle prévoit notamment des conditions d’exercice, une offre et un
contrat électroniques, un accusé de réception, une copie du contrat et une facture.
La source primaire est le Journal officiel :

- [Loi n° 18-05 — Journal officiel / ministère](https://www.mpt.gov.dz/wp-content/uploads/2023/11/Loi-n%C2%B0-18-05-du-10-mai-2018.-fr_0_0.pdf)
- [Copie publiée par l’ARPCE](https://www.arpce.dz/fr/file/l7w4c3)

La même loi contient des contraintes spécifiques d’inscription, de site/domaine et de
paiement lorsqu’elles sont applicables. Il serait imprudent de déduire de ce document
qu’un compte Stripe, une devise USD ou l’hébergement actuel les satisfont. Vérifier en
particulier la compatibilité du prestataire de paiement, de la domiciliation des fonds,
du nom de domaine et de l’hébergement avant toute ouverture locale.

## 3. Clients UE/EEE : contenu numérique et rétractation

Si Biblio cible des consommateurs de l’UE/EEE, un e-book téléchargé est du contenu
numérique non fourni sur support matériel. La fin du droit de rétractation au début de
la fourniture dépend notamment du consentement préalable exprès du client, de sa
reconnaissance de la perte du droit et de la confirmation du contrat par le vendeur.
Cette exception s’interprète strictement ; une simple clause cachée dans les CGV ne
suffit pas.

Référence officielle : [communication de la Commission européenne sur la directive
2011/83/UE, section 5.7](<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(04)>).

**Écart produit actuel :** avant Checkout, implémenter une case non pré-cochée,
enregistrer la version du texte, l’horodatage et la preuve de consentement, puis envoyer
la confirmation contractuelle/reçu. Ne pas activer le téléchargement immédiat en se
fondant sur un consentement non démontrable.

## 4. Fiscalité, prix et preuve de vente

- Déterminer avec un comptable les taxes indirectes, déclarations, seuils et règles de
  facturation de chaque territoire servi. Stripe Tax peut calculer des taxes, mais ne
  décide pas de l’obligation de s’immatriculer ni ne remplace les déclarations.
- Stripe indique que `automatic_tax`, les tax codes, le comportement de taxe et les
  enregistrements actifs sont nécessaires à une collecte automatisée :
  [documentation Stripe Tax](https://docs.stripe.com/payments/advanced/tax).
- Les livres numériques peuvent relever de taux différents selon le pays et la
  qualification exacte de l’offre. Ne pas déduire un taux d’un autre produit.
- Fixer une politique de prix TTC/HT cohérente et stocker, avant le lancement, les
  snapshots nécessaires au reçu/facture : sous-total, taxe, total, devise, identité du
  vendeur, numéro du document et date.
- Un remboursement doit être reflété dans la comptabilité et, si Stripe Tax/API Tax est
  utilisé, dans le mécanisme de correction fiscale approprié. Voir la
  [documentation Stripe sur les annulations de transactions fiscales](https://docs.stripe.com/tax/custom).

**Écart produit actuel :** Biblio est volontairement mono-devise USD et ne stocke pas
encore le détail taxe/facture. Cette limite empêche de déclarer la fiscalité prête pour le
live.

## 5. Catalogue, propriété intellectuelle et licences

Pour chaque ouvrage publié ou importé, conserver hors du seul code source un dossier :

- titulaire des droits/auteur/ayant droit, contrat ou source probante ;
- territoires, langue, format, illustration, traduction, version de fichier et date de
  vérification ;
- licence, attribution obligatoire, date d’expiration éventuelle et personne responsable
  de la revue ;
- procédure de retrait/takedown et contact de notification.

Project Gutenberg et le domaine public ne sont pas une autorisation mondiale de vendre
une œuvre : une traduction, une couverture ou une juridiction différente peuvent créer
des droits. Ne commercialiser aucun ouvrage tant que la chaîne de droits n’est pas
vérifiée pour les territoires réellement servis.

## 6. Protection des données et pages publiques à livrer

Avant une bêta avec clients externes, publier et faire vérifier : mentions légales,
politique de confidentialité, CGV, politique de remboursement, politique cookies si des
traceurs non essentiels existent, politique copyright/takedown et accessibilité/contact.
Documenter les sous-traitants, les finalités, durées de conservation, droits des
personnes, mesures de sécurité et procédure d’incident selon les lois applicables.

## 7. Porte de passage technique/ops

La revue légale ne remplace pas le contrôle technique, et inversement. Avant live :

- [ ] PostgreSQL de **test isolé** connecté via Arena/OAuth, migrations testées et
      rollback/procédure de sauvegarde validés ;
- [ ] Checkout, paiement, webhook, remboursement, accès et réconciliation Stripe test
      exercés de bout en bout ;
- [ ] les sept webhooks test configurés et l’alerte/rejeu documentés ;
- [ ] `npm run payments:reconcile -- --strict` et
      `npm run stripe:reconcile -- --strict` examinés sans écart non expliqué ;
- [ ] politique de conservation des journaux `stripe_events` et `stripe_sync_log`
      décidée ;
- [ ] identité, droits, fiscalité, consentement et documents client validés ;
- [ ] revue de lancement écrite autorisant explicitement la suppression du verrou
      Stripe live.

Tant qu’une case est ouverte, rester en Stripe test/staging et ne pas communiquer une
ouverture commerciale.
