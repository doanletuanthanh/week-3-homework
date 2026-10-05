import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";

describe("database exposure", () => {
  it("has row level security enabled on every public table", async () => {
    const tables = await getDb().execute<{ relname: string; relrowsecurity: boolean }>(sql`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    `);

    expect(tables.length).toBeGreaterThanOrEqual(8);
    expect(tables.filter((table) => !table.relrowsecurity).map((table) => table.relname)).toEqual([]);
  });

  it("defines no policy, so RLS denies every row to API roles", async () => {
    const [{ count }] = await getDb().execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(count).toBe(0);
  });

  it("grants the Data API roles nothing on any public table", async () => {
    const grants = await getDb().execute<{ grantee: string; table_name: string; privilege_type: string }>(sql`
      SELECT grantee, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    `);
    expect([...grants]).toEqual([]);
  });

  it("cannot be read with the anon role even though the tables exist", async () => {
    const db = getDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE anon`);
        await tx.execute(sql`SELECT 1 FROM "user" LIMIT 1`);
      }),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });
});
