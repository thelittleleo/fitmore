import { pool } from "@/lib/db";
import type { DataSource } from "./adapters/source";

// Pull samples from a source, normalize (already canonical here), and persist
// into raw_samples. Idempotent: re-running upserts the same rows.
export async function ingestFromSource(
  source: DataSource,
  personId: string,
  days: number,
  until: Date,
): Promise<number> {
  const samples = await source.fetchSamples({ personId, days, until });
  if (samples.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of samples) {
      await client.query(
        `insert into raw_samples (person_id, metric, ts, value, unit, source)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (person_id, metric, ts, source)
         do update set value = excluded.value, unit = excluded.unit`,
        [s.personId, s.metric, s.ts, s.value, s.unit, source.name],
      );
    }
    await client.query(
      `insert into connected_accounts (person_id, provider)
       values ($1, $2) on conflict (person_id, provider) do nothing`,
      [personId, source.name],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return samples.length;
}
