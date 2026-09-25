"use server";

import { randomInt } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { deleteAccount, restoreAccount } from "./account";
import { logAdmin, requireAdmin, snapshotChainUrl, triggerSnapshotChain } from "./admin";
import { cliTokens, crewMembers, crews, deviceCodes, mcpTokens, oauthGrants, repoNameOverrides, userTokens, users, type RepoNames, type StreakMode } from "@/db/schema";
import { STATS_TAG } from "./cache";
import { hashToken, newSecret } from "./cli";
import { and, eq, isNull } from "drizzle-orm";
import { encrypt } from "./crypto";
import { countStep } from "./funnel";
import { MCP_TOKEN_PREFIX } from "./mcp";
import { postMessage } from "./messages";
import { checkAuthorize, issueCode, publicOrigin, withParams, type AuthorizeParams } from "./oauth";
import { fetchTokenLogin, GitHubAuthError } from "./github";
import { newShareNonce } from "./share";
import { runSnapshot } from "./snapshot";
import { crewByCode, leaveCrew, regenerateCode, removeMember, renameCrew, userByLogin, type AdminResult } from "./crews";
import { canViewProfile, toggleProps } from "./props";
import { currentVisitor, recordEvent } from "./visits";
import { rateLimit } from "./ratelimit";
import { parseSignupCookie, SIGNUP_COOKIE } from "./signup";
import { parseWindow, windowQuery } from "./window";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

async function requireUserId(): Promise<number> {
  const session = await auth();
  if (!session) redirect("/");
  return session.user.id;
}

/** A sign-in started, and from which button when the button said (`lib/signup.ts`). Counts only, no visitor id. */
async function countSignInStart(): Promise<void> {
  const from = parseSignupCookie((await cookies()).get(SIGNUP_COOKIE)?.value)?.from;
  await Promise.all([countStep("signin_start"), from ? countStep(`signin_start:${from}`) : null]);
}

export async function signInWithGitHub(): Promise<void> {
  await countSignInStart();
  await signIn("github", { redirectTo: "/dashboard" });
}

export async function signInThenJoin(code: string): Promise<void> {
  await countSignInStart();
  await signIn("github", { redirectTo: `/join/${code}` });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/** First crew and no computer linked yet → step 2 of onboarding; otherwise straight to the board. */
async function afterCrew(userId: number, code: string): Promise<string> {
  const [machine] = await db.select({ id: cliTokens.id }).from(cliTokens).where(eq(cliTokens.userId, userId)).limit(1);
  return machine ? `/dashboard/c/${code}` : `/dashboard/setup?first=${code}`;
}

export async function createCrew(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim().slice(0, 40) : "";
  if (!name) redirect("/dashboard?error=name");
  const code = newCode();
  const [crew] = await db.insert(crews).values({ name, code, createdBy: userId }).returning({ id: crews.id });
  await db.insert(crewMembers).values({ crewId: crew.id, userId });
  updateTag(STATS_TAG);
  redirect(await afterCrew(userId, code));
}

export async function joinCrew(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const crew = await crewByCode(code);
  if (!crew) redirect("/dashboard?error=code");
  const joined = await db.insert(crewMembers).values({ crewId: crew.id, userId }).onConflictDoNothing().returning({ userId: crewMembers.userId });
  if (joined.length > 0) await countStep("invite_join");
  updateTag(STATS_TAG);
  redirect(await afterCrew(userId, crew.code));
}

/** The invite panel's one-click crew for a member who has none: "<login>'s crew", back on their own page. */
export async function createFirstCrew(): Promise<void> {
  const userId = await requireUserId();
  const [{ login }] = await db.select({ login: users.githubLogin }).from(users).where(eq(users.id, userId));
  const back = `/dashboard/u/${login}`;
  // A double click must not leave two crews behind.
  const [existing] = await db.select({ crewId: crewMembers.crewId }).from(crewMembers).where(eq(crewMembers.userId, userId)).limit(1);
  if (existing) redirect(back);
  const [crew] = await db.insert(crews).values({ name: `${login}'s crew`.slice(0, 40), code: newCode(), createdBy: userId }).returning({ id: crews.id });
  await db.insert(crewMembers).values({ crewId: crew.id, userId });
  updateTag(STATS_TAG);
  revalidatePath("/dashboard", "layout");
  redirect(back);
}

/** A member writes to the maintainer. Only ever into their own thread: the user id is the session's. */
export async function sendMessage(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const result = await postMessage(userId, false, formData.get("body"));
  // The redirect lands on the page the form is on; without this a production build keeps showing the old thread.
  revalidatePath("/dashboard/inbox");
  redirect(result === "ok" ? "/dashboard/inbox" : `/dashboard/inbox?error=${result}`);
}

/** The maintainer writes into one member's thread. */
export async function adminSendMessage(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = Number(formData.get("id"));
  const [user] = Number.isInteger(userId) ? await db.select({ id: users.id }).from(users).where(eq(users.id, userId)) : [];
  if (!user) redirect("/admin#inbox");
  const result = await postMessage(user.id, true, formData.get("body"));
  revalidatePath("/admin");
  redirect(`/admin?thread=${user.id}${result === "ok" ? "" : `&error=${result}`}#inbox`);
}

/** The link command was copied from the "link your computer" banner. */
export async function countCliBannerCopy(): Promise<void> {
  if (await auth()) await countStep("cli_banner_copy");
}

/** An invite link was copied or handed to the share sheet. */
export async function countInviteCopy(): Promise<void> {
  if (await auth()) await countStep("invite_copy");
}

export async function addToken(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const rawToken = formData.get("token");
  const rawLabel = formData.get("label");
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  const label = typeof rawLabel === "string" ? rawLabel.trim().slice(0, 40) : "";
  if (!label) redirect("/dashboard/settings?error=label#token");
  if (!token.startsWith("github_pat_")) redirect("/dashboard/settings?error=format#token");
  let login: string;
  try {
    login = await fetchTokenLogin(token);
  } catch (error) {
    redirect(error instanceof GitHubAuthError ? "/dashboard/settings?error=rejected#token" : "/dashboard/settings?error=github#token");
  }
  if (login.toLowerCase() !== session.user.login.toLowerCase()) redirect("/dashboard/settings?error=owner#token");
  await db.insert(userTokens).values({ userId: session.user.id, label, token: encrypt(token) });
  // `admin` on the run is "a person pressed a button", which covers this and /admin's snapshot-now;
  // the kind exists to tell first sign-ins apart from everything else.
  after(() => runSnapshot(new Date(Date.now() + 60_000), { onlyUserIds: [session.user.id], kind: "admin" }));
  redirect("/dashboard/settings?saved=1#token");
}

export async function removeToken(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/dashboard/settings");
  await db.delete(userTokens).where(and(eq(userTokens.id, id), eq(userTokens.userId, session.user.id)));
  redirect("/dashboard/settings?removed=1#token");
}

const REPO_NAMES: RepoNames[] = ["all", "public_only", "none"];
const STREAK_MODES: StreakMode[] = ["all_days", "weekdays"];

function pick<T extends string>(allowed: readonly T[], value: FormDataEntryValue | null): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** The visibility matrix: one row per question, one column for crewmates and one for everyone else. */
export async function updateProfile(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const repoNames = pick(REPO_NAMES, formData.get("repoNames"));
  const repoNamesGlobal = pick(REPO_NAMES, formData.get("repoNamesGlobal"));
  if (!repoNames || !repoNamesGlobal) redirect("/dashboard/settings?error=profile#visibility");
  await db
    .update(users)
    .set({
      profileVisibility: formData.get("profileEveryone") === "on" ? "everyone" : "crew",
      repoNames,
      repoNamesGlobal,
      sharePrivate: formData.get("sharePrivate") === "on",
      sharePrivateGlobal: formData.get("sharePrivateGlobal") === "on",
    })
    .where(eq(users.id, session.user.id));
  updateTag(STATS_TAG);
  redirect("/dashboard/settings?profile=1#visibility");
}

/** Whether the streak counts every day or only Mon–Fri. It is part of every board row, so re-tag. */
export async function updateStreakMode(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const streakMode = pick(STREAK_MODES, formData.get("streakMode"));
  if (!streakMode) redirect("/dashboard/settings?error=streak#streak-rule");
  await db.update(users).set({ streakMode }).where(eq(users.id, session.user.id));
  updateTag(STATS_TAG);
  redirect("/dashboard/settings?streak=1#streak-rule");
}

/**
 * Props once a week from the signed-in member to someone whose page they can open, never themselves;
 * pressing it again takes this week's back. The gate is re-checked here, not trusted from the page.
 */
export async function giveProps(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const user = await userByLogin(String(formData.get("login") ?? ""));
  if (!user || user.id === session.user.id || !(await canViewProfile(session.user.id, user))) return;
  if (!rateLimit("props", String(session.user.id)).ok) return;
  if (await toggleProps(session.user.id, user.id)) await countStep("props_give");
  revalidatePath(`/dashboard/u/${user.githubLogin}`);
}

export async function signInThenLink(code: string): Promise<void> {
  await countSignInStart();
  await signIn("github", { redirectTo: `/link?code=${code}` });
}

/** The link page is often opened in whichever browser the OS calls default, where somebody else may
 *  be signed in; this drops that session and comes straight back to the same code. */
export async function signOutThenLink(code: string): Promise<void> {
  await signOut({ redirectTo: `/link?code=${code}` });
}

export async function confirmDevice(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw.toUpperCase() : "";
  const [device] = await db.select().from(deviceCodes).where(eq(deviceCodes.code, code)).limit(1);
  if (!device || device.expiresAt < new Date() || device.userId) redirect(`/link?code=${code}`);
  const token = newSecret();
  // A previous link attempt from the same machine that never synced is dead weight; replace it.
  await db.delete(cliTokens).where(and(eq(cliTokens.userId, session.user.id), eq(cliTokens.machine, device.machine), isNull(cliTokens.lastSyncAt)));
  await db.insert(cliTokens).values({ userId: session.user.id, tokenHash: hashToken(token), machine: device.machine });
  await db.update(deviceCodes).set({ userId: session.user.id, issuedToken: token }).where(eq(deviceCodes.id, device.id));
  await countStep("cli_linked");
  const visitor = await currentVisitor();
  if (visitor) await recordEvent(visitor, "cli_linked", "/link");
  redirect(`/link?code=${code}&done=1`);
}

export async function revokeMachine(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/dashboard/settings");
  await db.delete(cliTokens).where(and(eq(cliTokens.id, id), eq(cliTokens.userId, session.user.id)));
  redirect("/dashboard/settings?revoked=1#computers");
}

/** What the MCP token form shows after a submit: the new token, once, or why there is none. */
export type McpTokenState = { token?: string; error?: string };

/** A personal MCP token. Only its hash is stored, so the raw value is returned to the form this one time. */
export async function createMcpToken(_prev: McpTokenState, formData: FormData): Promise<McpTokenState> {
  const session = await auth();
  if (!session) redirect("/");
  const rawLabel = formData.get("label");
  const label = typeof rawLabel === "string" ? rawLabel.trim().slice(0, 40) : "";
  if (!label) return { error: "give the token a label (e.g. claude code on my laptop)" };
  const token = `${MCP_TOKEN_PREFIX}${newSecret()}`;
  await db.insert(mcpTokens).values({ userId: session.user.id, tokenHash: hashToken(token), label });
  revalidatePath("/dashboard/settings");
  return { token };
}

/** The authorization request travels through the consent form as its original query string and is checked again here. */
async function authorizeRequest(formData: FormData) {
  const raw = formData.get("request");
  const query = new URLSearchParams(typeof raw === "string" ? raw : "");
  const origin = publicOrigin(await headers());
  const params: AuthorizeParams = Object.fromEntries(query);
  return { query, origin, checked: await checkAuthorize(params, origin) };
}

export async function approveOAuth(formData: FormData): Promise<void> {
  const session = await auth();
  const { query, origin, checked } = await authorizeRequest(formData);
  if (!session) redirect(`/oauth/authorize?${query}`);
  if (!checked.ok) redirect("redirect" in checked ? checked.redirect : `/oauth/authorize?${query}`);
  redirect(await issueCode(checked, session.user.id, origin));
}

export async function denyOAuth(formData: FormData): Promise<void> {
  const { query, origin, checked } = await authorizeRequest(formData);
  if (!checked.ok) redirect("redirect" in checked ? checked.redirect : `/oauth/authorize?${query}`);
  redirect(withParams(checked.redirectUri, { error: "access_denied", error_description: "the member said no", state: checked.state, iss: origin }));
}

export async function signInThenAuthorize(query: string): Promise<void> {
  await countSignInStart();
  await signIn("github", { redirectTo: `/oauth/authorize?${query}` });
}

export async function signOutThenAuthorize(query: string): Promise<void> {
  await signOut({ redirectTo: `/oauth/authorize?${query}` });
}

export async function revokeOAuthGrant(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/dashboard/settings#assistants");
  await db.delete(oauthGrants).where(and(eq(oauthGrants.id, id), eq(oauthGrants.userId, session.user.id)));
  redirect("/dashboard/settings?mcp=disconnected#assistants");
}

export async function revokeMcpToken(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/dashboard/settings#assistants");
  await db.delete(mcpTokens).where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, session.user.id)));
  redirect("/dashboard/settings?mcp=revoked#assistants");
}

/** Crew admin. The mutations and their ownership checks live in `lib/crews.ts`; these resolve the session and redirect. */
function formCode(formData: FormData): string {
  const raw = formData.get("code");
  return typeof raw === "string" ? raw.toUpperCase() : "";
}

/** The board's window, round-tripped through the form and re-parsed so only a known window comes back. */
function formWindow(formData: FormData): string {
  const raw = formData.get("w");
  const q = new URLSearchParams(typeof raw === "string" ? raw : "");
  return windowQuery(parseWindow({ w: q.get("w") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined }));
}

function adminRedirect(code: string, result: AdminResult, done: string, window: string): never {
  if (result.ok) redirect(`/dashboard/c/${result.code}?${window}&manage=1&${done}=1`);
  if (result.reason === "name") redirect(`/dashboard/c/${code}?${window}&manage=1&error=name`);
  redirect(result.reason === "forbidden" ? `/dashboard/c/${code}?${window}` : "/dashboard");
}

/**
 * The nav's crew list is an uncached read in the dashboard layout, so a redirect back to the same
 * route would reuse the client's copy of it and keep showing the old name or the old code.
 */
export async function renameCrewAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = formCode(formData);
  const name = formData.get("name");
  const result = await renameCrew(code, userId, typeof name === "string" ? name : "");
  if (result.ok) revalidatePath("/dashboard", "layout");
  adminRedirect(code, result, "renamed", formWindow(formData));
}

export async function regenerateCodeAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = formCode(formData);
  const result = await regenerateCode(code, userId, newCode());
  if (result.ok) revalidatePath("/dashboard", "layout");
  adminRedirect(code, result, "recoded", formWindow(formData));
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = formCode(formData);
  const memberId = Number(formData.get("userId"));
  const window = formWindow(formData);
  if (!Number.isInteger(memberId)) redirect(`/dashboard/c/${code}?${window}&manage=1`);
  const result = await removeMember(code, userId, memberId);
  if (result.ok) updateTag(STATS_TAG);
  adminRedirect(code, result, "removed", window);
}

export async function leaveCrewAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  await leaveCrew(formCode(formData), userId);
  updateTag(STATS_TAG);
  redirect("/dashboard");
}

/** Self-serve account deletion: the typed login has to match, then every row goes and the session ends. */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const typed = formData.get("confirm");
  if (typeof typed !== "string" || typed.trim().toLowerCase() !== session.user.login.toLowerCase()) {
    redirect("/dashboard/settings?error=confirm#data");
  }
  await deleteAccount(session.user.id);
  updateTag(STATS_TAG);
  await signOut({ redirectTo: "/" });
}

/**
 * Hide or show one repo's name, on top of the visibility matrix. Only ever about your own rows.
 * Returns to the repo table it was clicked in, not to the top of a page several screens long.
 */
export async function toggleRepoName(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  const nodeId = formData.get("nodeId");
  const hidden = formData.get("hidden") === "1";
  if (typeof nodeId !== "string" || !nodeId) redirect(`/dashboard/u/${session.user.login}#repos`);
  await db
    .insert(repoNameOverrides)
    .values({ userId: session.user.id, repoNodeId: nodeId, hidden })
    .onConflictDoUpdate({ target: [repoNameOverrides.userId, repoNameOverrides.repoNodeId], set: { hidden } });
  updateTag(STATS_TAG);
  const back = formData.get("back");
  redirect(typeof back === "string" && back.startsWith("/dashboard/") ? back : `/dashboard/u/${session.user.login}#repos`);
}

/**
 * Admin actions. Each re-checks `ADMIN_GITHUB_IDS` through `requireAdmin`, which 404s rather than
 * redirecting, so a form posted by a non-admin is answered the same way the page is. Each writes
 * one `admin_log` row after the change, and the destructive two confirm by typed name in the UI —
 * but the name is also re-checked here, because a form post is not a button click.
 */

/** The typed confirmation, checked again on the server against the row the action is about to touch. */
function confirmedAs(formData: FormData, expected: string): boolean {
  const typed = formData.get("confirm");
  return typeof typed === "string" && typed === expected;
}

function adminId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/admin");
  return id;
}

export async function adminDeleteUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = adminId(formData);
  const [target] = await db.select({ login: users.githubLogin }).from(users).where(eq(users.id, id));
  if (!target || !confirmedAs(formData, target.login)) redirect("/admin?done=mismatch#members");
  await deleteAccount(id);
  await logAdmin(admin.login, "delete_user", `${target.login} #${id}`);
  updateTag(STATS_TAG);
  redirect("/admin?done=deleted#archive");
}

export async function adminRestoreUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = adminId(formData);
  const login = await restoreAccount(id);
  if (!login) redirect("/admin?done=gone#archive");
  await logAdmin(admin.login, "restore_user", `${login} (archive #${id})`);
  updateTag(STATS_TAG);
  redirect("/admin?done=restored#members");
}

export async function adminRevokeMachine(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = adminId(formData);
  const [target] = await db
    .select({ machine: cliTokens.machine, login: users.githubLogin })
    .from(cliTokens)
    .innerJoin(users, eq(users.id, cliTokens.userId))
    .where(eq(cliTokens.id, id));
  if (!target || !confirmedAs(formData, target.machine)) redirect("/admin?done=mismatch#members");
  await db.delete(cliTokens).where(eq(cliTokens.id, id));
  await logAdmin(admin.login, "revoke_machine", `${target.machine} (${target.login})`);
  redirect("/admin?done=revoked#members");
}

export async function adminSnapshotUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = adminId(formData);
  const [target] = await db.select({ login: users.githubLogin }).from(users).where(eq(users.id, id));
  if (!target) redirect("/admin");
  after(() => runSnapshot(new Date(Date.now() + 60_000), { onlyUserIds: [id], kind: "admin" }));
  await logAdmin(admin.login, "snapshot_user", `${target.login} #${id}`);
  redirect("/admin?done=snapshot#members");
}

export async function adminSnapshotChain(): Promise<void> {
  const admin = await requireAdmin();
  const url = await snapshotChainUrl();
  if (url) after(() => triggerSnapshotChain(url));
  await logAdmin(admin.login, "snapshot_chain", "every member");
  redirect("/admin?done=chain#runs");
}

/**
 * The error boundaries are client components, so the only handle they hold on a server failure is
 * its digest. Next logs the stack under that digest but never says which route or which member hit
 * it; this puts the three in one line so the next occurrence can be traced back from the `ref` the
 * boundary shows.
 */
export async function reportBoundary(path: string, digest: string | undefined): Promise<void> {
  const session = await auth();
  console.error(`[boundary] path=${path} digest=${digest ?? "none"} user=${session?.user.id ?? "anon"}`);
}

/**
 * "New link" on the share panel. Rotating the nonce changes the key every share signature is made
 * with, so every link minted before this one stops verifying — a revoke without a revocation list.
 */
export async function rotateShareLink(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/");
  await db.update(users).set({ shareNonce: newShareNonce() }).where(eq(users.id, session.user.id));
  // The page mints its tokens from the nonce, so without this the panel comes back showing the
  // link that was just killed.
  revalidatePath(`/dashboard/u/${session.user.login}`);
  const view = formData.get("view");
  redirect(`/dashboard/u/${session.user.login}?${typeof view === "string" && view ? `${view}&` : ""}share=1#share`);
}
