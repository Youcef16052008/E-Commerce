import { test, expect } from "@playwright/test";

/**
 * Catalogue public : liste, filtre, page produit.
 * Nécessite la base peuplée (npm run seed:products).
 */
test("le catalogue liste des ouvrages et permet d'ouvrir une fiche", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Catalogue" })).toBeVisible();

  // Les produits seedés sont affichés (liste de cartes).
  await expect(page.getByText("La Mer des Étoiles")).toBeVisible();

  // Recherche filtrante.
  await page.getByLabel("Rechercher").fill("algorithme");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(page.getByText("L'Algorithme Secret")).toBeVisible();
  await expect(page.getByText("La Mer des Étoiles")).not.toBeVisible();

  // Ouvrir la fiche depuis une carte.
  await page.getByText("L'Algorithme Secret").click();
  await expect(page).toHaveURL(/\/products\/l-algorithme-secret/);
  await expect(page.getByRole("heading", { name: "L'Algorithme Secret" })).toBeVisible();
});
