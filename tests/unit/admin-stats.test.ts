import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ADMIN_ORDER_STATUSES,
  RECENT_ORDERS_LIMIT,
  REVENUE_ORDER_STATUSES,
  TOP_PRODUCTS_LIMIT,
  buildOrdersByStatus,
  emptyOrdersByStatus,
  isRevenueStatus,
} from "@/features/admin/domain/admin-stats-types";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

vi.mock("@/features/authentication/lib/session", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/features/admin/application/admin-stats-service", () => ({
  viewAdminStats: vi.fn(),
}));

import { getSessionUser } from "@/features/authentication/lib/session";
import { viewAdminStats } from "@/features/admin/application/admin-stats-service";
import { GET } from "@/app/api/admin/stats/route";

/**
 * Tests unitaires du domaine stats admin (Slice 8) — fonctions pures,
 * aucune BDD. La règle métier critique : le revenu = paid + fulfilled
 * UNIQUEMENT (jamais pending/failed/refunded).
 */
describe("domaine stats admin", () => {
  it("expose les 5 statuts de commande, dans l'ordre attendu", () => {
    expect(ADMIN_ORDER_STATUSES).toEqual(["pending", "paid", "fulfilled", "failed", "refunded"]);
  });

  it("le revenu ne compte que paid et fulfilled", () => {
    expect(REVENUE_ORDER_STATUSES).toEqual(["paid", "fulfilled"]);
    for (const status of ADMIN_ORDER_STATUSES) {
      expect(isRevenueStatus(status)).toBe(REVENUE_ORDER_STATUSES.includes(status));
    }
  });

  it("rejette explicitement pending, failed et refunded du revenu", () => {
    expect(isRevenueStatus("pending")).toBe(false);
    expect(isRevenueStatus("failed")).toBe(false);
    expect(isRevenueStatus("refunded")).toBe(false);
    expect(isRevenueStatus("paid")).toBe(true);
    expect(isRevenueStatus("fulfilled")).toBe(true);
  });

  it("initialise la répartition par statut à zéro pour tous les statuts", () => {
    const record = emptyOrdersByStatus();
    for (const status of ADMIN_ORDER_STATUSES) {
      expect(record[status]).toBe(0);
    }
    expect(Object.keys(record).sort()).toEqual([...ADMIN_ORDER_STATUSES].sort());
  });

  it("complète les statuts absents à zéro (groupBy partiel)", () => {
    const record = buildOrdersByStatus([
      { status: "paid", count: 3 },
      { status: "refunded", count: 1 },
    ]);
    expect(record).toEqual({
      pending: 0,
      paid: 3,
      fulfilled: 0,
      failed: 0,
      refunded: 1,
    });
  });

  it("cumule les lignes dupliquées d'un même statut", () => {
    const record = buildOrdersByStatus([
      { status: "paid", count: 2 },
      { status: "paid", count: 5 },
    ]);
    expect(record.paid).toBe(7);
  });

  it("ignore les statuts inconnus (protection contre une valeur hors enum)", () => {
    const record = buildOrdersByStatus([
      { status: "unknown" as OrderStatus, count: 9 },
      { status: "paid", count: 1 },
    ]);
    expect(record.paid).toBe(1);
    expect(record.paid + record.pending + record.fulfilled + record.failed + record.refunded).toBe(
      1,
    );
  });

  it("borne l'affichage à 5 dernières commandes et 5 top produits", () => {
    expect(RECENT_ORDERS_LIMIT).toBe(5);
    expect(TOP_PRODUCTS_LIMIT).toBe(5);
  });
});

describe("GET /api/admin/stats — garde requireAdmin", () => {
  const mockedGetSessionUser = vi.mocked(getSessionUser);
  const mockedViewAdminStats = vi.mocked(viewAdminStats);

  beforeEach(() => {
    mockedGetSessionUser.mockReset();
    mockedViewAdminStats.mockReset();
  });

  it("renvoie 401 si non connecté", async () => {
    mockedGetSessionUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
    expect(mockedViewAdminStats).not.toHaveBeenCalled();
  });

  it("renvoie 403 si connecté mais rôle customer", async () => {
    mockedGetSessionUser.mockResolvedValue({
      id: "u1",
      name: "Client",
      email: "client@test.com",
      role: "customer",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FORBIDDEN");
    expect(mockedViewAdminStats).not.toHaveBeenCalled();
  });

  it("renvoie 200 + les stats si admin", async () => {
    mockedGetSessionUser.mockResolvedValue({
      id: "a1",
      name: "Admin",
      email: "admin@test.com",
      role: "admin",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    mockedViewAdminStats.mockResolvedValue({
      productsTotal: 10,
      productsPublished: 8,
      productsDraft: 2,
      ordersTotal: 3,
      ordersByStatus: { pending: 1, paid: 1, fulfilled: 1, failed: 0, refunded: 0 },
      revenueInCents: 250,
      currency: "usd",
      paidOrdersCount: 2,
      customersTotal: 4,
      recentOrders: [],
      topProducts: [],
      revenueFormatted: "$2.50",
      ordersByStatusLabel: {
        pending: "En attente de paiement",
        paid: "Payée",
        fulfilled: "Livrée",
        failed: "Échec du paiement",
        refunded: "Remboursée",
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revenueInCents).toBe(250);
    expect(body.currency).toBe("usd");
    expect(body.paidOrdersCount).toBe(2);
    expect(mockedViewAdminStats).toHaveBeenCalledTimes(1);
  });
});
