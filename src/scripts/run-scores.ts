import "dotenv/config";
import { pool } from "@/lib/db";
import { computeScores } from "@/engine/scores";

if (import.meta.url === `file://${process.argv[1]}`) {
  computeScores()
    .then(() => {
      console.log("✓ recovery / strain / sleep scores computed");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
