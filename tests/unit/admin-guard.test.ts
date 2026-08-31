import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/features/authentication/lib/session", () => ({
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "@/features/authentication/lib/session";
import { requireAdmin } from "@/features/admin/application/require-admin";

const mockedGetSessionUser = vi.mocked(getSessionUser);

describe("requireAdmin", () => {
  beforeEach(() => {
    mockedGetSessionUser.mockReset();
  });

  it("renvoie 401 si non connecté", async () => {
    mockedGetSessionUser.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.admin).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
    const body = await result.error!.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("renvoie 403 si rôle customer", async () => {
    mockedGetSessionUser.mockResolvedValue({
      id: "u1",
      name: "Client",
      email: "client@test.com",
      role: "customer",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const result = await requireAdmin();
    expect(result.admin).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(403);
    const body = await result.error!.json();
    expect(body.error).toBe("FORBIDDEN");
  });

  it("autorise un admin", async () => {
    mockedGetSessionUser.mockResolvedValue({
      id: "a1",
      name: "Admin",
      email: "admin@test.com",
      role: "admin",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const result = await requireAdmin();
    expect(result.error).toBeNull();
    expect(result.admin).not.toBeNull();
    expect(result.admin!.id).toBe("a1");
    expect(result.admin!.role).toBe("admin");
    expect(result.admin!.email).toBe("admin@test.com");
  });
});
