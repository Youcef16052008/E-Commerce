# Lighthouse — mesures réelles

**Date des mesures : 2026-09-01** (Slice 9).

Tous les scores ci-dessous sont **réellement mesurés** (aucun score inventé).
Les pages non mesurées sont marquées comme telles.

## Environnement de mesure

| Élément         | Valeur                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| App             | Build production (`npm run build` + `next start`), Next.js 16.3.3                                                                 |
| Base de données | PostgreSQL 17 locale (migrations + seed démo)                                                                                     |
| Navigateur      | Chromium **149.0.7827.0** (headless, `--no-sandbox --disable-gpu`)                                                                |
| Outil           | **Lighthouse 13.4.1** (CLI Node)                                                                                                  |
| Profil          | Émulation **mobile** (défaut Lighthouse) + throttling simulé par défaut                                                           |
| Catégories      | performance, accessibility, best-practices, seo                                                                                   |
| Machine         | Sandbox Linux x86-64 (CPU partagé — les temps CPU sont plus lents que sur une vraie machine ; les scores normalisés sont stables) |

## Commande exacte

```bash
# 1) Monter l'app en build production
npm run build
npm run start   # http://localhost:3000 (bind 0.0.0.0)

# 2) Lighthouse (Chromium npm + Lighthouse, hors du dépôt : outils de mesure
#    non versionnés dans le projet)
CHROME_PATH=<chemin/vers/chromium> \
node node_modules/lighthouse/cli/index.js "http://localhost:3000/<page>" \
  --chrome-flags="--no-sandbox --headless=new --disable-gpu --disable-dev-shm-usage" \
  --output=json --output-path=/tmp/lh-<page>.json \
  --only-categories=performance,accessibility,best-practices,seo \
  --form-factor=mobile
```

## Résultats

### Pages publiques mesurées

Toutes les valeurs de la table sont relevées sur les rapports JSON du 2026-09-01.

| Page                    |    Perf |    A11y | Best-practices |     SEO | FCP    | LCP      | TBT   | CLS |
| ----------------------- | ------: | ------: | -------------: | ------: | ------ | -------- | ----- | --: |
| `/` (accueil)           |  **99** | **100** |        **100** | **100** | 773 ms | 1 673 ms | 91 ms |   0 |
| `/products` (catalogue) | **100** | **100** |        **100** | **100** | 818 ms | 1 727 ms | 47 ms |   0 |
| `/auth/sign-in`         | **100** | **100** |        **100** | **100** | 768 ms | 1 218 ms | 87 ms |   0 |

CLS = 0 sur les 3 pages (pas de reflow : polices système, dimensions fixes).

### Pages non mesurées (à faire)

| Page                               | Raison                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/admin` (dashboard)               | Nécessite une session admin (Lighthouse CLI sans flux d'authentification) — **auditée manuellement** (cf. `docs/accessibility.md`) |
| `/admin/products`, `/admin/orders` | Idem (session admin requise)                                                                                                       |
| `/cart`, `/library`, `/orders`     | Nécessite une session customer — **auditées manuellement**                                                                         |
| `/checkout/success`                | Nécessite une session Stripe (mode test)                                                                                           |

**Prochaine mesure conseillée** : sur l'URL de production (Vercel, Slice 10),
relancer la même commande avec `--form-factor=mobile` ET `--preset=desktop`
pour conserver les deux profils, et ajouter les pages protégées via un cookie
de session (`--extra-headers` ou un script de connexion préalable).

## Observations (mesures réelles, sans invention)

- **A11y 100/100 sur les 3 pages publiques** après les correctifs Slice 9
  (contrastes `text-neutral-400` → `500`, ordre des titres h1→h2, `th scope`,
  lien d'évitement, `aria-hidden` sur les placeholders décoratifs).
- **CLS = 0** partout : pas de reflow (polices système, dimensions fixes).
- **Perf 99-100** : rendu serveur Next 16, pas d'image lourde sur ces pages
  (couvertures `loading="lazy"` uniquement dans le catalogue).
- LCP 1,2-1,7 s : premier rendu dominé par le CPU du sandbox partagé ; sur une
  machine dédiée/edge Vercel ces valeurs seront nettement plus basses
  (à re-mesurer sur la production, Slice 10).
