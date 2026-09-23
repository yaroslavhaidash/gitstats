import { eq } from "drizzle-orm";
import { db } from "@/db";
import { crews, users } from "@/db/schema";

/**
 * The seeded crew behind `/demo`, written by `scripts/seed-demo.ts`. Its members carry
 * `users.is_demo`, which is what keeps them out of the global board, the footer counts, the admin
 * totals and the nightly snapshot. Everything under `/demo` is public and read-only.
 */
export const DEMO_CREW_CODE = "DEMO24";

export const DEMO_BANNER = "demo crew · generated data · sign in to start yours";

/** Node id prefix for the seeded repos. `demo:` can never collide: GitHub node ids are base64 and
 *  the ids the CLI invents start with `local:`. */
export const DEMO_REPO_PREFIX = "demo:repo:";

/** The crew's logins, in board order. `scripts/seed-demo.ts` writes exactly these; the sitemap
 *  lists them without a database read, so a build never depends on Postgres being up. Underscores
 *  on purpose: a GitHub login cannot contain one, so no real member's sign-in can collide with them. */
export const DEMO_LOGINS = ["mara_vex", "kestrel_io", "nine_volt", "pilar_dev"] as const;

export async function demoCrew(): Promise<{ id: number; name: string } | null> {
  const [crew] = await db.select({ id: crews.id, name: crews.name }).from(crews).where(eq(crews.code, DEMO_CREW_CODE)).limit(1);
  return crew ?? null;
}

export type DemoMember = { id: number; login: string; name: string | null; avatarUrl: string };

export async function demoMembers(): Promise<DemoMember[]> {
  return db
    .select({ id: users.id, login: users.githubLogin, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.isDemo, true))
    .orderBy(users.id);
}
