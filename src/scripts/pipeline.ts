import "dotenv/config";
import { pool } from "@/lib/db";
import { migrate } from "./migrate";
import { seed } from "./seed";
import { summarizeAll } from "@/engine/summarize";
import { computeScores } from "@/engine/scores";
import { generateInsights } from "@/engine/insight";

// The whole M1 pipe in one command: schema → mock ingest → deterministic
// summaries → insight. This is the sequence a scheduler would run nightly/weekly
// once real data is flowing.
async function main() {
  console.log("→ migrate");
  await migrate();
  console.log("→ ingest (mock)");
  await seed();
  console.log("→ summarize");
  await summarizeAll();
  console.log("✓ daily summaries + flags computed");
  console.log("→ scores (recovery / strain / sleep)");
  await computeScores();
  console.log("✓ scores computed");
  console.log("→ insights");
  await generateInsights();
  console.log("\n✓ pipeline complete — start the app with `npm run dev`");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
