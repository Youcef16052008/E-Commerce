import { test, expect } from "@playwright/test";

/**
 * Parcours panier e2e : connexion, ajout depuis une fiche, aménagement du panier,
 * retrait. Nécessite base + seed.
 */
const email = `e2e-cart-${Date.now()}@biblio.test`;
const password = "MotDePasse!123";

test("ajouter un ouvrage au panier et le retirer", async ({ page }) => {
  // Inscription d'un client de test.
  await page.goto("/auth/sign-up");
  await page.getByLabel("Nom").fill("Panier E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Créer mon compte|Inscription/ }).click();
  // Confirme l'authentification via l'en-tête (nom affiché) plutôt que l'URL seule.
  await expect(page.getByText("Panier E2E")).toBeVisible();

  // Aller sur une fiche produit puis ajouter au panier.
  await page.getByRole("link", { name: "Explorer le catalogue" }).click();
  await expect(page.getByRole("heading", { name: "Catalogue" })).toBeVisible();
  await page.getByText("La Mer des Étoiles").click();
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByRole("button", { name: "Voir mon panier" })).toBeVisible();

  // Ouvrir le panier et vérifier la présence de l'article.
  await page.getByRole("button", { name: "Voir mon panier" }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText("La Mer des Étoiles")).toBeVisible();

  // Retirer l'article → panier vide.
  await page.getByRole("button", { name: "Retirer du panier" }).click();
  await expect(page.getByText("Votre panier est vide.")).toBeVisible();
});
