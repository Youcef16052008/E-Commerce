import {
  EXPORT_NOTES,
  assessDeletion,
  type AccountExport,
  type DeletionMode,
} from "../domain/account-types";
import {
  anonymiseUser,
  hardDeleteUser,
  listOrderStatuses,
  readUserData,
} from "../infrastructure/account-repo";

/**
 * Service applicatif « compte » (RGPD).
 * - `exportAccount` : droit d'accès / portabilité (art. 15 & 20) — JSON complet.
 * - `deleteAccount` : droit à l'effacement (art. 17) — hard delete ou anonymisation
 *   selon `assessDeletion`, jamais pendant une opération financière en cours.
 * Aucune de ces opérations ne touche Stripe ni la machine à états des commandes.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function shapeExport(
  data: NonNullable<Awaited<ReturnType<typeof readUserData>>>,
  now: Date = new Date(),
): AccountExport {
  const itemsByOrder = new Map<string, AccountExport["orders"][number]["items"]>();
  for (const it of data.items) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push({
      productId: it.productId,
      title: it.title,
      priceInCents: it.priceInCents,
      quantity: it.quantity,
    });
    itemsByOrder.set(it.orderId, list);
  }

  return {
    format: "biblio-account-export",
    version: 1,
    exportedAt: now.toISOString(),
    profile: {
      id: data.profile.id,
      email: data.profile.email,
      name: data.profile.name,
      role: data.profile.role,
      createdAt: data.profile.createdAt.toISOString(),
    },
    cart: data.cart.map((c) => ({
      productId: c.productId,
      title: c.title,
      addedAt: c.addedAt.toISOString(),
    })),
    orders: data.orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalInCents: o.totalInCents,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      paidAt: iso(o.paidAt),
      items: itemsByOrder.get(o.id) ?? [],
    })),
    entitlements: data.entitlements.map((e) => ({
      productId: e.productId,
      title: e.title,
      orderId: e.orderId,
      grantedAt: e.grantedAt.toISOString(),
    })),
    refunds: data.refunds.map((r) => ({
      orderId: r.orderId,
      status: r.status,
      amountInCents: r.amountInCents,
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
      completedAt: iso(r.completedAt),
    })),
    sessions: data.sessions.map((s) => ({
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      userAgent: s.userAgent,
    })),
    notes: EXPORT_NOTES,
  };
}

export async function exportAccount(userId: string): Promise<AccountExport | null> {
  const data = await readUserData(userId);
  return data ? shapeExport(data) : null;
}

export type DeleteAccountResult =
  | { ok: true; mode: "hard" | "anonymise" }
  | { ok: false; error: "blocked"; detail: Extract<DeletionMode, { mode: "blocked" }> };

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const decision = assessDeletion(await listOrderStatuses(userId));
  switch (decision.mode) {
    case "blocked":
      return { ok: false, error: "blocked", detail: decision };
    case "hard":
      await hardDeleteUser(userId);
      return { ok: true, mode: "hard" };
    case "anonymise":
      await anonymiseUser(userId);
      return { ok: true, mode: "anonymise" };
  }
}
