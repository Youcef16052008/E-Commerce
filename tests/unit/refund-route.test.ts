import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const adminGuard = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const refundService = vi.hoisted(() => ({ requestFullOrderRefund: vi.fn() }));

vi.mock("@/features/admin/application/require-admin", () => adminGuard);
vi.mock("@/features/refunds/application/refund-service", () => refundService);

import { POST } from "@/app/api/admin/orders/[id]/refund/route";

const context = { params: Promise.resolve({ id: "order-1" }) };

describe("POST /api/admin/orders/:id/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a cross-origin browser request before touching the financial workflow", async () => {
    const request = new NextRequest("http://biblio.test/api/admin/orders/order-1/refund", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "CSRF_ORIGIN_MISMATCH" });
    expect(adminGuard.requireAdmin).not.toHaveBeenCalled();
    expect(refundService.requestFullOrderRefund).not.toHaveBeenCalled();
  });

  it("returns the admin guard response before touching Stripe workflow", async () => {
    const guard = new Response(JSON.stringify({ error: "FORBIDDEN" }), { status: 403 });
    adminGuard.requireAdmin.mockResolvedValue({ error: guard });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/orders/order-1/refund"),
      context,
    );

    expect(response.status).toBe(403);
    expect(refundService.requestFullOrderRefund).not.toHaveBeenCalled();
  });

  it("accepts an admin request but returns 202 pending, not refunded", async () => {
    adminGuard.requireAdmin.mockResolvedValue({ admin: { id: "admin-1" } });
    refundService.requestFullOrderRefund.mockResolvedValue({
      ok: true,
      refundRequestId: "refund-request-1",
      status: "pending",
    });
    const request = new NextRequest("http://localhost/api/admin/orders/order-1/refund", {
      method: "POST",
      body: JSON.stringify({ reason: "requested_by_customer" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      refundRequestId: "refund-request-1",
      status: "pending",
    });
    expect(refundService.requestFullOrderRefund).toHaveBeenCalledWith("order-1", "admin-1", {
      reason: "requested_by_customer",
    });
  });
});
