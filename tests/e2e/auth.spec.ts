import { test, expect } from "@playwright/test";

/**
 * Parcours d'authentification e2e.
 * Utilise un email unique pour rester idempotent entre exécutions.
 * Nécessite une base accessible + la migration appliquée.
 */
const email = `e2e-${Date.now()}@biblio.test`;
const password = "MotDePasse!123";

test("inscription puis déconnexion puis connexion", async ({ page }) => {
  // --- Inscription ---
  await page.goto("/auth/sign-up");
  await page.getByLabel("Nom").fill("Test E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Créer mon compte|Inscription/ }).click();

  // Redirigé vers l'accueil, connecté (nom affiché dans l'en-tête).
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Test E2E")).toBeVisible();

  // --- Déconnexion ---
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("link", { name: "Se connecter" })).toBeVisible();

  // --- Connexion ---
  await page.getByRole("link", { name: "Se connecter" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Se connecter|Connexion/ }).click();
  await expect(page.getByText("Test E2E")).toBeVisible();
});
