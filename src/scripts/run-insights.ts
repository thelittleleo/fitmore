import "dotenv/config";
import { pool } from "@/lib/db";
import { generateInsights } from "@/engine/insight";

if (import.meta.url === `file://${process.argv[1]}`) {
  generateInsights()
    .then(() => {
      console.log("✓ insights generated");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
