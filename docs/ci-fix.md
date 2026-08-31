# Correctif CI — ordre des étapes (à appliquer avant merge du PR #1)

Les tests d'**intégration** (`npm test` inclut `tests/integration/`) exigent que les
tables existent et que le catalogue soit seedé. Le workflow actuel exécute
`npm test` **avant** `npm run db:migrate` / `npm run seed:all` : sur la base
Postgres vierge du runner, les suites d'intégration échouent.

## Correction

Déplacer les étapes **Apply DB migrations** et **Seed demo data** juste avant
**Unit / integration tests** (voir le patch prêt à appliquer : `docs/ci-order.patch`).

```bash
# depuis la racine du dépôt (branche du PR, votre machine) :
git apply docs/ci-order.patch
git add .github/workflows/ci.yml
git commit -m "ci: migrations + seed avant les tests d'intégration"
git push origin arena/01a05802-e-commerce
```

## Pourquoi ne pas l'avoir commité ici

Le jeton GitHub App utilisé pour pousser cette branche n'a pas la permission
**`workflows`** (refus : *"refusing to allow a GitHub App to create or update
workflow .github/workflows/ci.yml without workflows permission"*). Deux solutions :

1. **Appliquer/pousser le patch depuis votre machine** (recommandé, 1 minute) ;
2. **Accorder l'écriture** `workflows` au bot GitHub App (Settings → GitHub Apps
   → l'app Arena → Repository permissions → Workflows : Read and write).

> Le reste de la branche est poussé et le PR est prêt ; ce patch est le seul
> point en suspens pour une CI **verte** de bout en bout.
