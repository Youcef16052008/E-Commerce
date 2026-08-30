import { test, expect } from "@playwright/test";

test("la page d'accueil affiche l'identité Biblio", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Biblio/);
  await expect(page.getByRole("heading", { name: "Biblio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorer le catalogue" })).toBeVisible();
});
