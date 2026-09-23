import "dotenv/config";
import { seedDemo } from "../lib/seed";

/** Writes the `/demo` crew by hand; the nightly cron does the same.
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 */
seedDemo()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
