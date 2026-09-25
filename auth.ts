import NextAuth, { AuthError, type Profile } from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "@/db";
import { users } from "@/db/schema";
import { revalidateForUsers } from "@/lib/cache";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { countStep } from "@/lib/funnel";
import { parseSignupCookie, SIGNUP_COOKIE, type SignupSource } from "@/lib/signup";
import { currentVisitor, recordSignIn } from "@/lib/visits";

type GitHubIdentity = {
  login: string;
  nodeId: string;
  githubId: number | null;
  avatarUrl: string;
  name: string | null;
};

function readGitHubIdentity(profile: Profile): GitHubIdentity {
  const { login, node_id: nodeId, avatar_url: avatarUrl, name, id } = profile;
  if (typeof login !== "string" || typeof nodeId !== "string" || typeof avatarUrl !== "string") {
    throw new Error("GitHub profile is missing login, node_id or avatar_url");
  }
  return { login, nodeId, avatarUrl, name: typeof name === "string" ? name : null, githubId: typeof id === "number" ? id : null };
}

/** `source` lands only on a new row: the conflict update below leaves the signup columns alone. */
async function upsertUser(identity: GitHubIdentity, source: SignupSource | null): Promise<{ id: number; isNew: boolean }> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.githubNodeId, identity.nodeId)).limit(1);
  const [row] = await db
    .insert(users)
    .values({
      githubLogin: identity.login,
      githubNodeId: identity.nodeId,
      githubId: identity.githubId,
      avatarUrl: identity.avatarUrl,
      name: identity.name,
      signupFrom: source?.from,
      signupReferrerHost: source?.referrerHost,
      signupLandingPath: source?.landingPath,
      signupUtmSource: source?.utmSource,
      signupUtmCampaign: source?.utmCampaign,
    })
    .onConflictDoUpdate({
      target: users.githubNodeId,
      set: {
        githubLogin: identity.login,
        githubId: identity.githubId,
        avatarUrl: identity.avatarUrl,
        name: identity.name,
      },
    })
    .returning({ id: users.id });
  return { id: row.id, isNew: existing === undefined };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    GitHub({ authorization: { params: { scope: "read:user user:email" } } }),
  ],
  logger: {
    // The error page is told little more than "Configuration"; the specific failure (a cancelled
    // consent is OAuthCallbackError, a throw in a callback CallbackRouteError) only arrives here.
    error(error) {
      console.error(error);
      const code = error instanceof AuthError ? error.type : error.name;
      // An undecodable session cookie is logged on every page it rides along with, not on a sign-in;
      // `proxy.ts` clears it and counts it once as `stale_session`.
      if (code === "JWTSessionError") return;
      const count = () => Promise.all([countStep("signin_error"), countStep(`signin_error:${code}`)]);
      try {
        after(count);
      } catch {
        // Logged outside a request, where there is nothing to hang `after` on.
        void count();
      }
    },
  },
  callbacks: {
    // The OAuth access token arrives in `account` and is deliberately never
    // copied anywhere: GitHub sign-in is identity only.
    async jwt({ token, profile }) {
      if (profile) {
        const identity = readGitHubIdentity(profile);
        const source = parseSignupCookie((await cookies()).get(SIGNUP_COOKIE)?.value);
        const { id, isNew } = await upsertUser(identity, source);
        await countStep(isNew ? "signin_new" : "signin_returning");
        if (isNew && source?.from) await countStep(`signin_new:${source.from}`);
        token.uid = id;
        token.login = identity.login;
        // The footer's member count is cached for hours and refreshed by snapshots, ingest and crew
        // writes — none of which a brand new account has done yet, so without this it reads its own
        // first page and is not in the number. `revalidateTag`, not `updateTag`: this callback runs
        // inside the Auth.js route handler, where `updateTag` throws. The first snapshot itself is
        // started by the dashboard layout, which has a render to hang `after()` on.
        if (isNew) await revalidateForUsers([id]);
        // The OAuth callback comes from the same browser that clicked sign-in, so it is the same visitor.
        await recordSignIn(await currentVisitor(), id, identity.login);
      }
      return token;
    },
    session({ session, token }) {
      const { uid, login } = token;
      if (typeof uid !== "number" || typeof login !== "string") {
        throw new Error("Session token is missing user identity");
      }
      return { ...session, user: { ...session.user, id: uid, login } };
    },
  },
});
