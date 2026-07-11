import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@/lib/db";

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("✓ schema applied");
}

// Run directly (not when imported by the pipeline).
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
