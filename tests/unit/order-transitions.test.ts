import { describe, expect, it } from "vitest";
import {
  ORDER_TRANSITIONS,
  canTransition,
  allowedTransitions,
} from "@/features/orders/domain/order-transitions";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/**
 * Machine à états des commandes (registre L-1) : le tableau est la règle métier,
 * ici on fige chaque case — toute transition ajoutée/retirée doit être un
 * choix conscient (et documenté dans le fichier domaine).
 */
const ALL: OrderStatus[] = ["pending", "paid", "fulfilled", "failed", "refunded"];

// Payment and refund states are Stripe-managed. The only human operational
// transition is marking an already-paid order fulfilled.
const ALLOWED: [OrderStatus, OrderStatus][] = [["paid", "fulfilled"]];

describe("canTransition (L-1)", () => {
  it("autorise exactement les transitions du tableau", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const expected = ALLOWED.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("refuse toujours l'identité (paid → paid, refunded → refunded, …)", () => {
    for (const s of ALL) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it("refunded et failed sont terminaux", () => {
    for (const to of ALL) {
      expect(canTransition("failed", to)).toBe(false);
      expect(canTransition("refunded", to)).toBe(false);
    }
  });

  it("les statuts inconnus au futur restent refusés (pas de crash)", () => {
    const future = "shipped" as OrderStatus;
    expect(canTransition("paid", future)).toBe(false);
    expect(canTransition(future, "paid")).toBe(false);
    expect(allowedTransitions(future)).toEqual([]);
  });

  it("allowedTransitions reflète le tableau (l'UI n'invente rien)", () => {
    expect([...ORDER_TRANSITIONS.pending].sort()).toEqual(
      [...allowedTransitions("pending")].sort(),
    );
    expect(allowedTransitions("refunded")).toEqual([]);
  });
});
