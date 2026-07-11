import "dotenv/config";
import { pool } from "@/lib/db";
import { summarizeAll } from "@/engine/summarize";

if (import.meta.url === `file://${process.argv[1]}`) {
  summarizeAll()
    .then(() => {
      console.log("✓ daily summaries + flags computed");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
