/**
 * Standalone script to recompute cost basis.
 * Usage: npx tsx scripts/recompute-cost-basis.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { recomputeCostBasis } from "../src/lib/compute-cost-basis";

const USER_ID = "cmkcrl6bp0000u27sw1oqio5c";

async function main() {
  console.log("Starting cost basis recompute...");
  await recomputeCostBasis(USER_ID);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
