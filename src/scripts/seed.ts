import "dotenv/config";
import { pool, query } from "@/lib/db";
import { createMockSource } from "@/ingest/adapters/mock";
import { ingestFromSource } from "@/ingest/ingest";

const PEOPLE = [
  { id: "you", displayName: "You", isCardiacPatient: false },
  { id: "mum", displayName: "Mum", isCardiacPatient: true },
];

export async function seed(): Promise<void> {
  const days = Number(process.env.MOCK_DAYS ?? 35);
  const until = new Date(); // "today"

  for (const p of PEOPLE) {
    await query(
      `insert into persons (id, display_name, is_cardiac_patient)
       values ($1, $2, $3)
       on conflict (id) do update set
         display_name = excluded.display_name,
         is_cardiac_patient = excluded.is_cardiac_patient`,
      [p.id, p.displayName, p.isCardiacPatient],
    );
  }

  const source = createMockSource();
  for (const p of PEOPLE) {
    const n = await ingestFromSource(source, p.id, days, until);
    console.log(`✓ ingested ${n} samples for ${p.displayName} (${days} days, source: ${source.name})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
