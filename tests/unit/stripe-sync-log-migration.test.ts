import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("stripe_sync_log migration", () => {
  it("keeps the reconciliation audit log append-only at the database boundary", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "drizzle/0007_outstanding_omega_sentinel.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE TRIGGER stripe_sync_log_append_only");
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "stripe_sync_log"');
    expect(sql).toContain('REVOKE UPDATE, DELETE ON TABLE "stripe_sync_log" FROM PUBLIC');
  });
});
