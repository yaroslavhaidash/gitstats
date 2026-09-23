import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type ProfileVisibility = "crew" | "everyone";
export type RepoNames = "all" | "public_only" | "none";
export type StreakMode = "all_days" | "weekdays";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  githubLogin: text("github_login").notNull().unique(),
  githubNodeId: text("github_node_id").notNull().unique(),
  /** Numeric GitHub id; the CLI derives the noreply commit email from it. */
  githubId: integer("github_id"),
  /** Per-user key the CLI uses to HMAC remote URLs, so repo identities are stable across the user's machines. */
  hashSalt: text("hash_salt"),
  avatarUrl: text("avatar_url").notNull(),
  name: text("name"),
  /** Who may open this user's page: crewmates only, or every signed-in member. */
  profileVisibility: text("profile_visibility").$type<ProfileVisibility>().notNull().default("everyone"),
  /** Which repo names crewmates may see on this user's page. */
  repoNames: text("repo_names").$type<RepoNames>().notNull().default("public_only"),
  /** Which repo names everyone else may see. */
  repoNamesGlobal: text("repo_names_global").$type<RepoNames>().notNull().default("none"),
  /** Whether private-repo numbers are included in what crewmates see (crew boards and profile). */
  sharePrivate: boolean("share_private").notNull().default(true),
  /** The same, for everyone outside your crews: the global board and a profile opened by a stranger. */
  sharePrivateGlobal: boolean("share_private_global").notNull().default(true),
  /** Whether the streak counts every day or only Mon–Fri, so a Friday→Monday run stays unbroken. */
  streakMode: text("streak_mode").$type<StreakMode>().notNull().default("all_days"),
  /** When the nightly job last finished this user. The queue is ordered by it, oldest (and never) first. */
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  /**
   * Mixed into every share-card signature. Null until the member first rotates it; "new link" on
   * the share panel writes a fresh value, which is what makes every link minted before it a 404.
   */
  shareNonce: text("share_nonce"),
  /** A member of the seeded demo crew: real rows, invented numbers. Kept out of every "everyone" query. */
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StatsSource = "github" | "local";

export const repos = pgTable("repos", {
  /** GitHub node id, or `local:<hmac of remote url>` for repos only known through the CLI. */
  githubNodeId: text("github_node_id").primaryKey(),
  nameWithOwner: text("name_with_owner").notNull(),
  isFork: boolean("is_fork").notNull().default(false),
  isPrivate: boolean("is_private").notNull().default(false),
  primaryLanguage: text("primary_language"),
  stargazerCount: integer("stargazer_count").notNull().default(0),
  statsPending: boolean("stats_pending").notNull().default(false),
  /** GitHub's last push time. Null for CLI-only repos, which GitHub never reports on. */
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
  /** The `pushed_at` the last successful `stats/contributors` fetch covered; equal means nothing changed, so skip it. */
  statsFetchedFor: timestamp("stats_fetched_for", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weeklyStats = pgTable(
  "weekly_stats",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    repoNodeId: text("repo_node_id")
      .notNull()
      .references(() => repos.githubNodeId),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    additions: integer("additions").notNull(),
    deletions: integer("deletions").notNull(),
    commits: integer("commits").notNull(),
    /** Work on branches the default branch has not taken in yet. Shown, never ranked. */
    pendingAdditions: integer("pending_additions").notNull().default(0),
    pendingDeletions: integer("pending_deletions").notNull().default(0),
    pendingCommits: integer("pending_commits").notNull().default(0),
    /** Who wrote this row. Once a user has `local` rows for a repo, the GitHub snapshot leaves that (user, repo) alone. */
    source: text("source").$type<StatsSource>().notNull().default("github"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.repoNodeId, t.weekStart] }), index("weekly_stats_user_week_idx").on(t.userId, t.weekStart)],
);

export const dailyContributions = pgTable(
  "daily_contributions",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date", { mode: "string" }).notNull(),
    contributionCount: integer("contribution_count").notNull(),
  },
  // The primary key is already btree (user_id, date); a second index on the same columns in the
  // same order served nothing and was maintained on every upsert.
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export type SnapshotError = { scope: string; message: string };
/** Who asked for a run: the nightly chain, a new member's first sign-in, or a person pressing a button. */
export type SnapshotKind = "nightly" | "signin" | "admin";

export const snapshotRuns = pgTable("snapshot_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  usersProcessed: integer("users_processed").notNull().default(0),
  /** Users still waiting when this run gave its budget back; > 0 is what makes the cron chain another run. */
  usersPending: integer("users_pending").notNull().default(0),
  reposProcessed: integer("repos_processed").notNull().default(0),
  /** Ties the chained invocations of one night together. */
  chainId: text("chain_id"),
  kind: text("kind").$type<SnapshotKind>().notNull().default("nightly"),
  /** `x-ratelimit-remaining` from the last GitHub call this run made; null when it made none. */
  quotaRemaining: integer("quota_remaining"),
  errors: jsonb("errors").$type<SnapshotError[]>().notNull().default([]),
});

export const crews = pgTable("crews", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: integer("crew_id")
      .notNull()
      .references(() => crews.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

/** Read-only fine-grained PATs a member connected; one per GitHub resource owner (personal account, each org). */
export const userTokens = pgTable("user_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  label: text("label").notNull(),
  /** AES-256-GCM encrypted, see lib/crypto.ts. */
  token: text("token").notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("user_tokens_user_idx").on(t.userId)]);

/** Device-code pairing in flight: the CLI polls with `pollSecret` until the user confirms in the browser. */
export const deviceCodes = pgTable("device_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  pollSecret: text("poll_secret").notNull().unique(),
  machine: text("machine").notNull(),
  userId: integer("user_id").references(() => users.id),
  /** Issued once the user confirms; handed to the CLI on its next poll, then cleared. */
  issuedToken: text("issued_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** A linked computer. The CLI authenticates `/api/ingest` with the raw token; only its sha256 is stored. */
export const cliTokens = pgTable("cli_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  machine: text("machine").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncRepos: integer("last_sync_repos"),
  lastSyncError: text("last_sync_error"),
  /** The CLI version of the last sync; null until a machine on 0.3.0 or newer reports one. */
  cliVersion: text("cli_version"),
}, (t) => [index("cli_tokens_user_idx").on(t.userId)]);

/** Per-day commit counts uploaded by the CLI. Only private repos' rows feed the calendar; public activity comes from GitHub. */
export const dailyLocal = pgTable(
  "daily_local",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    repoNodeId: text("repo_node_id")
      .notNull()
      .references(() => repos.githubNodeId),
    date: date("date", { mode: "string" }).notNull(),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    commits: integer("commits").notNull(),
    /** Same as `weekly_stats`: unmerged-branch work, shown but never ranked. */
    pendingAdditions: integer("pending_additions").notNull().default(0),
    pendingDeletions: integer("pending_deletions").notNull().default(0),
    pendingCommits: integer("pending_commits").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.repoNodeId, t.date] }), index("daily_local_user_date_idx").on(t.userId, t.date)],
);

/**
 * Per-repo exception to the repo-names row of the visibility matrix. A row only ever hides more
 * than the matrix does; it never reveals a name the matrix keeps back.
 */
export const repoNameOverrides = pgTable(
  "repo_name_overrides",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    repoNodeId: text("repo_node_id")
      .notNull()
      .references(() => repos.githubNodeId),
    hidden: boolean("hidden").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.repoNodeId] })],
);

export type AdminAction = "delete_user" | "restore_user" | "revoke_machine" | "snapshot_user" | "snapshot_chain";

/** Every mutation made from `/admin`, so a mistake leaves a trail that says who and what. */
export const adminLog = pgTable("admin_log", {
  id: serial("id").primaryKey(),
  /** The admin's GitHub login, copied in: the row has to outlive the account that made it. */
  who: text("who").notNull(),
  action: text("action").$type<AdminAction>().notNull(),
  target: text("target").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every row of one deleted member, in the shape `restoreAccount` puts back. The secrets are here
 * too — a restore has to return a working account, and this table is admin-only and short-lived.
 * `device_codes` is the one thing left out: a ten-minute pairing that is nothing but secrets.
 */
export type ArchivedAccount = {
  user: Record<string, unknown>;
  crewMembers: Record<string, unknown>[];
  cliTokens: Record<string, unknown>[];
  userTokens: Record<string, unknown>[];
  weeklyStats: Record<string, unknown>[];
  dailyContributions: Record<string, unknown>[];
  dailyLocal: Record<string, unknown>[];
  repoNameOverrides: Record<string, unknown>[];
};

/** A deleted member, kept for 30 days so an accidental delete can be undone, then purged nightly. */
export const deletedUsersArchive = pgTable("deleted_users_archive", {
  id: serial("id").primaryKey(),
  /** The id the member had. Not a foreign key — the row it pointed at is what we are keeping. */
  userId: integer("user_id").notNull(),
  login: text("login").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").$type<ArchivedAccount>().notNull(),
});

/** What `/gh/<login>` shows: one GraphQL call's worth of a GitHub user's public year. */
export type HandleData = {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Oldest first, one per day of the last year, ending today. */
  days: number[];
  /** Sunday-start weeks, oldest first, the last 26 ending this week. */
  weeks: { weekStart: string; commits: number }[];
  streak: number;
  topLanguage: string | null;
  totalCommits: number;
  /** True when a repo had more active days than GitHub lists, so some older weeks are short. */
  weeksPartial: boolean;
  /** Top public repos by commits in the year. */
  repos: { nameWithOwner: string; commits: number; stars: number; language: string | null }[];
};

/**
 * The public handle view's cache, keyed by lowercased login. `data` is null for a login GitHub does
 * not know, so a typo is not re-fetched on every refresh either.
 */
export const handleCache = pgTable("handle_cache", {
  login: text("login").primaryKey(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").$type<HandleData | null>(),
  /** Set once a signed-in member has opened this handle; only those pages are offered for indexing. */
  memberViewed: boolean("member_viewed").notNull().default(false),
});

/** How far visitors get through sign-in, one counter per UTC day and step. Counts only: nothing
 *  here says who, from where, or with which account. */
export const funnelDaily = pgTable(
  "funnel_daily",
  {
    day: date("day").notNull(),
    step: text("step").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.step] })],
);
