# Accessibilité — audit & correctifs (Slice 9)

**Date : 2026-09-01.** Objectif : atteindre les cibles **WCAG 2.1 AA** sur les
pages critiques (accueil, catalogue, fiche produit, panier, auth, bibliothèque,
commandes, admin).

## Méthode

1. **Lighthouse (mesuré)** — catégorie accessibility sur les pages publiques
   (commandes + résultats : `docs/lighthouse.md`). Résultat après correctifs :
   **100/100** sur `/`, `/products`, `/auth/sign-in`.
2. **Revue manuelle** des pages protégées (Lighthouse CLI sans flux de
   connexion) : `/admin`, `/admin/products`, `/admin/orders`, `/cart`,
   `/library`, `/orders`, `/checkout/success`.

## Correctifs appliqués (Slice 9)

| Thème              | Avant                                                                                                                | Après                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contrastes         | `text-neutral-400` (#a3a3a3, **2,4:1** — échec AA) sur sous-textes d'empty states, id de commande, libellés admin    | `text-neutral-500` (#737373, **4,6:1** — conforme AA) ; les 3 emojis 📕 décoratifs passent en `aria-hidden="true"` (exclus de l'audit contraste) |
| Ordre des titres   | Cartes catalogue en `<h3>` sans `<h2>` parent (audit Lighthouse `heading-order` en échec)                            | Titres de cartes en `<h2>` (séquence h1 → h2) ; idem bibliothèque (titre d'ouvrage en `<h2>` englobant le lien)                                  |
| Tableaux           | `<th>` sans portée sur les 2 tableaux admin (6 + 8 cellules)                                                         | `scope="col"` sur chaque en-tête ; le tableau du dashboard (Slice 8) est livré avec `scope` + `<caption>` SR                                     |
| Navigation clavier | Pas de lien d'évitement                                                                                              | Skip-link « Aller au contenu principal » (visible au focus) + cible `#contenu-principal` focusable (`tabIndex={-1}`) dans le layout racine       |
| Noms accessibles   | Sélecteur de statut de commande : `aria-label` identique sur toutes les lignes (ambigu pour lecteur d'écran)         | `aria-label="Statut de la commande <id 8>"` — unique par ligne                                                                                   |
| États d'erreur     | Front d'erreur par défaut Next (anglais)                                                                             | `src/app/error.tsx` + `src/app/admin/error.tsx` (FR, actions « Réessayer » / retour, référence de digest)                                        |
| Empty states       | Légèrement hétérogènes (admin commandes sans sous-texte)                                                             | Motif uniforme FR : « Aucune … pour le moment. » + sous-texte explicatif + CTA quand utile                                                       |
| `role="alert"`     | déjà en place (formulaires auth, boutons panier/checkout/download, actions admin)                                    | conservé — vérifié sur chaque composant client                                                                                                   |
| `lang`             | `lang="fr"` sur `<html>`                                                                                             | conservé (racine)                                                                                                                                |
| Focus visible      | inputs/sélecteurs : `outline-none` + `focus:border-neutral-900` (contraste net) ; liens/boutons : outline navigateur | conservé — aucun élément interactif sans indicateur de focus                                                                                     |

## Revue par page (état après Slice 9)

| Page                              | h1 unique |            Labels formulaires            |    role="alert"    | Contraste AA | Titre séquentiel |
| --------------------------------- | :-------: | :--------------------------------------: | :----------------: | :----------: | :--------------: |
| `/`                               |    ✅     |                   n/a                    |        n/a         |      ✅      |        ✅        |
| `/products`                       |    ✅     | ✅ (recherche sr-only, selects englobés) |        n/a         |      ✅      |        ✅        |
| `/products/[slug]`                |    ✅     |                   n/a                    | ✅ (ajout panier)  |      ✅      |        ✅        |
| `/cart`                           |    ✅     |                   n/a                    | ✅ (lignes panier) |      ✅      |        ✅        |
| `/auth/sign-in` · `/auth/sign-up` |    ✅     |                    ✅                    |         ✅         |      ✅      |        ✅        |
| `/library`                        |    ✅     |                   n/a                    |   ✅ (download)    |      ✅      |        ✅        |
| `/orders`                         |    ✅     |                   n/a                    |        n/a         |      ✅      |        ✅        |
| `/checkout/success`               |    ✅     |                   n/a                    |        n/a         |      ✅      |        ✅        |
| `/admin` (dashboard)              |    ✅     |                   n/a                    |        n/a         |      ✅      |   ✅ (h1 → h2)   |
| `/admin/products`                 |    ✅     |                    ✅                    | ✅ (actions ligne) |      ✅      |        ✅        |
| `/admin/orders`                   |    ✅     |          ✅ (aria-label unique)          |    ✅ (statut)     |      ✅      |        ✅        |

## Ce qui reste (honnêtement)

- **Pages protégées non mesurées par Lighthouse** (session requise) : audit
  manuel ci-dessus ; relancer Lighthouse avec cookie de session après le
  déploiement (Slice 10) pour objectiver `/admin`.
- **Aucun test de lecteur d'écran réel** (NVDA/VoiceOver) n'a été réalisé dans
  le sandbox — les correctifs visent les règles WCAG/axe vérifiables.
- **Touch targets** : certains contrôles admin (boutons « − »/« + » du panier,
  sélecteurs) sont compacts ; acceptable sur desktop (cible admin), à évaluer
  si l'admin devient mobile-first (hors périmètre).
- **Responsive mobile** validé e2e (projet `mobile-chrome` dans la config
  Playwright) ; pas de test dédié de zoom 200 % (à ajouter en P2).
