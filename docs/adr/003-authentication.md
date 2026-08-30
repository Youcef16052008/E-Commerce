# ADR-003 — Authentification & autorisation

## Statut

Proposé.

## Contexte

Email/mot de passe, sessions, RBAC admin/customer. On veut rester self-hosted, en TypeScript,
avec contrôle du modèle de données.

## Options

- **Better Auth (1.6.x)** — TypeScript-first, self-hosted, plugins (RBAC, 2FA), sessions DB.
  Successeur d'Auth.js depuis sept 2025.
- Auth.js / NextAuth v5 — **en maintenance (security-only)** → non recommandé pour un nouveau projet.
- Clerk / Supabase Auth — plus rapide mais couplage vendor + coût/limites.

## Décision

Better Auth (email/password). RBAC par `role` sur l'utilisateur.

## Conséquences

- Session httpOnly côté serveur ; jamais exposée au client.
- **Sécurité dans chaque Server Action / Route Handler**, pas seulement middleware
  (post-CVE-2025-29927 : middleware = UX, pas sécurité).
- Rate limiting sur auth via plugin.
