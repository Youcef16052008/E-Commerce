import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_LABELS,
  orderStatusLabel,
  orderStatusStyle,
} from "@/features/orders/domain/order-status";

/**
 * Tests unitaires des libellés/statuts de commande (fonctions pures).
 */

describe("orderStatusLabel", () => {
  it("libelle tous les statuts du checkout en français", () => {
    expect(orderStatusLabel("pending")).toBe("En attente de paiement");
    expect(orderStatusLabel("paid")).toBe("Payée");
    expect(orderStatusLabel("fulfilled")).toBe("Livrée");
    expect(orderStatusLabel("refund_pending")).toBe("Remboursement en cours");
    expect(orderStatusLabel("failed")).toBe("Échec du paiement");
    expect(orderStatusLabel("refunded")).toBe("Remboursée");
  });

  it("couvre exactement les 6 statuts (cohérence avec le checkout)", () => {
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([
      "failed",
      "fulfilled",
      "paid",
      "pending",
      "refund_pending",
      "refunded",
    ]);
  });

  it("retombe sur le statut brut si inconnu", () => {
    expect(orderStatusLabel("weird" as never)).toBe("weird");
  });
});

describe("orderStatusStyle", () => {
  it("fournit un style pour chaque statut", () => {
    for (const status of [
      "pending",
      "paid",
      "fulfilled",
      "refund_pending",
      "failed",
      "refunded",
    ] as const) {
      expect(orderStatusStyle(status)).toContain("border");
      expect(orderStatusStyle(status)).toContain("bg-");
      expect(orderStatusStyle(status)).toContain("text-");
    }
  });

  it("retombe sur pending pour un statut inconnu", () => {
    expect(orderStatusStyle("weird" as never)).toBe(orderStatusStyle("pending"));
  });
});
