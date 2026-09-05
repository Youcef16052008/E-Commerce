import { test, expect } from "@playwright/test";

test("la page d'accueil affiche l'identité Biblio", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Biblio/);
  await expect(page.getByRole("heading", { name: "Biblio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explorer le catalogue" })).toBeVisible();
});

test("les headers de sécurité sont réellement servis (H-5)", async ({ page, request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res.headers()["strict-transport-security"] ?? "").toContain("max-age=31536000");
  expect(res.headers()["cross-origin-resource-policy"]).toBe("same-origin");
});
