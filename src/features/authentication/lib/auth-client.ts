"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth côté navigateur.
 * N'importe *jamais* la config serveur (qui contient le secret / la connexion DB).
 * L'URL de base est déduite de l'URL courante par défaut.
 */
export const authClient = createAuthClient();
