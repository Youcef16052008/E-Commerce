import { test, expect } from "@playwright/test";

/**
 * Parcours d'authentification e2e.
 * Email unique par projet ET par exécution (les projets chromium/mobile partagent
 * le même worker : un email définie au niveau du fichier créerait un conflit
 * d'inscription entre les deux projets → boucle de re-render / clic détaché).
 */
const password = "MotDePasse!123";

test("inscription puis déconnexion puis connexion", async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().project.name}@biblio.test`;
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
  // Navigation PLEINE PAGE (pas de lien client) : évite la course avec un
  // router.refresh() encore en vol depuis la déconnexion (bouton détaché).
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  // Soumission par Entrée : chemin utilisateur réel, indépendant de la stabilité
  // du clic sur le bouton (re-render de l'en-tête pendant la validation).
  await page.getByLabel("Mot de passe").press("Enter");
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Test E2E")).toBeVisible();
});
