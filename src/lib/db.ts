import { Pool } from "pg";

const DEFAULT_URL = "postgres://fitmore:fitmore@localhost:5432/fitmore";

// Reuse a single pool across Next.js hot reloads and script runs.
const globalForPg = globalThis as unknown as { __fitmorePool?: Pool };

export const pool: Pool =
  globalForPg.__fitmorePool ??
  new Pool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_URL });

if (!globalForPg.__fitmorePool) globalForPg.__fitmorePool = pool;

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}
