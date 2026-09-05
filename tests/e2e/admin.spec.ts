import { test, expect } from "@playwright/test";

/**
 * Parcours admin e2e (Slices 7-8).
 *
 * - /admin non connecté → redirect sign-in avec ?next=/admin
 * - /admin en customer → panneau 403 explicite (pas de fuite de données)
 * - /admin en admin → dashboard avec chiffres réels BDD (Slice 8) :
 *   4 cartes chiffres (au moins un chiffre dans chacune) et plus de
 *   placeholder « arriveront plus tard ».
 *
 * Connexion par `goto` + `fill` + `press("Enter")` (soumission de formulaire
 * réelle, sans clic flaky sur le bouton pendant le re-render de l'en-tête).
 * Email customer unique par projet ET par exécution (les projets
 * chromium/mobile partagent le même worker — même motif que auth.spec.ts).
 */

const ADMIN_EMAIL = "admin@biblio.test";
const ADMIN_PASSWORD = "Bibli0-Admin!";

test("non connecté : /admin redirige vers sign-in avec ?next=/admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("customer : /admin affiche un panneau 403 explicite", async ({ page }) => {
  const email = `e2e-admin-cust-${Date.now()}-${test.info().project.name}@biblio.test`;

  // Inscription (soumission par Entrée).
  await page.goto("/auth/sign-up");
  await page.getByLabel("Nom").fill("Client Admin E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill("MotDePasse!123");
  await page.getByLabel("Mot de passe").press("Enter");
  await expect(page).toHaveURL("/");

  // /admin : pas de redirect, panneau 403 (l'email du compte est affiché).
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accès refusé" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("réservée aux administrateurs")).toBeVisible();
});

test("admin : /admin affiche le dashboard avec des chiffres réels", async ({ page }) => {
  // Connexion admin (soumission par Entrée).
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Mot de passe").fill(ADMIN_PASSWORD);
  await page.getByLabel("Mot de passe").press("Enter");
  await expect(page).toHaveURL("/");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  // 4 cartes chiffres clés, chacune avec au moins un chiffre (BDD, zéro hardcode).
  const cards = page.locator("section[aria-label='Chiffres clés'] > div");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await expect(card).toContainText(/\d/);
  }

  // Le revenu est affiché en USD formaté (ex. $0.00, $12.50).
  await expect(page.getByText(/^\$\d+(\.\d{2})?/)).toBeVisible();

  // Placeholder de la Slice 7 supprimé par la Slice 8.
  await expect(page.getByText("arriveront plus tard")).toHaveCount(0);

  // Navigation vers les pages de gestion.
  await expect(page.getByRole("link", { name: /Gérer le catalogue/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Voir toutes les commandes/ })).toBeVisible();
});
