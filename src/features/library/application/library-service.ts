import {
  listUserLibrary,
  userHasEntitlement,
  getProductFile,
} from "../infrastructure/library-repo";
import { createPresignedDownloadUrl, isStorageConfigured } from "@/server/storage";
import type { LibraryItem, LibraryError } from "../domain/library-types";

/**
 * Service applicatif de la bibliothèque.
 * - Liste les ouvrages pour lesquels l'utilisateur détient un droit d'accès.
 * - Génère un lien de téléchargement PRÉ-SIGNÉ à TTL court, après vérification
 *   que l'utilisateur possède bien l'entitlement (autorisation objet par objet).
 */
export async function viewLibrary(userId: string): Promise<LibraryItem[]> {
  return listUserLibrary(userId);
}

export async function createDownloadLink(
  userId: string,
  productId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: LibraryError }> {
  // 1. Autorisation : l'utilisateur doit posséder l'entitlement.
  const hasEntitlement = await userHasEntitlement(userId, productId);
  if (!hasEntitlement) {
    return { ok: false, error: { code: "NOT_ENTITLED" } };
  }

  // 2. Vérifier que le fichier existe.
  const product = await getProductFile(productId);
  if (!product?.fileUrl) {
    return { ok: false, error: { code: "FILE_NOT_AVAILABLE" } };
  }

  // 3. Générer une URL pré-signée (TTL court), si le stockage est configuré.
  if (!isStorageConfigured()) {
    return { ok: false, error: { code: "STORAGE_NOT_CONFIGURED" } };
  }

  const key = new URL(product.fileUrl).pathname.replace(/^\//, "");
  const url = await createPresignedDownloadUrl(key, 900); // 15 min
  return { ok: true, url };
}
