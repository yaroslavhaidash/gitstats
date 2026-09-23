import "dotenv/config";
import { runSnapshot } from "../lib/snapshot";

runSnapshot(new Date(Date.now() + 240_000))
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
