import { requireEnv } from "./env";

const API = "https://api.github.com";

export type RateLimit = { remaining: number; limit: number; resetAt: Date };

export type ActiveRepo = {
  nodeId: string;
  nameWithOwner: string;
  stargazerCount: number;
  isFork: boolean;
  isPrivate: boolean;
  primaryLanguage: string | null;
  /** GitHub's last push time, ISO. Drives the "nothing changed, skip stats/contributors" check. */
  pushedAt: string | null;
};

export type Contributions = {
  totalCommitContributions: number;
  restrictedContributionsCount: number;
  days: { date: string; contributionCount: number }[];
  repos: ActiveRepo[];
};

export type ContributorWeek = { weekStart: string; additions: number; deletions: number; commits: number };
export type ContributorStat = { authorNodeId: string; authorLogin: string; weeks: ContributorWeek[] };
export type ContributorStatsResult =
  | { status: "ok"; stats: ContributorStat[] }
  | { status: "pending" }
  | { status: "gone" };

const CONTRIBUTIONS_QUERY = `
query($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login:$login) {
    contributionsCollection(from:$from, to:$to) {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories:100) {
        repository { id nameWithOwner stargazerCount isPrivate isFork pushedAt primaryLanguage { name } }
        contributions { totalCount }
      }
    }
  }
}`;

type ContributionsResponse = {
  data?: {
    user: {
      contributionsCollection: {
        totalCommitContributions: number;
        restrictedContributionsCount: number;
        contributionCalendar: {
          weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
        };
        commitContributionsByRepository: {
          repository: {
            id: string;
            nameWithOwner: string;
            stargazerCount: number;
            isPrivate: boolean;
            isFork: boolean;
            pushedAt: string | null;
            primaryLanguage: { name: string } | null;
          };
          contributions: { totalCount: number };
        }[];
      };
    } | null;
  };
  errors?: { message: string }[];
};

type RestContributor = {
  author: { login: string; node_id: string } | null;
  weeks: { w: number; a: number; d: number; c: number }[];
};

export class GitHubAuthError extends Error {}

export function serverToken(): string {
  return requireEnv("GITHUB_TOKEN");
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gitstats-snapshot",
  };
}

export function readRateLimit(res: Response): RateLimit | null {
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  const limit = Number(res.headers.get("x-ratelimit-limit"));
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || !reset) return null;
  return { remaining, limit, resetAt: new Date(reset * 1000) };
}

export async function fetchContributions(
  token: string,
  login: string,
  from: Date,
  to: Date,
): Promise<{ contributions: Contributions; rateLimit: RateLimit | null }> {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      query: CONTRIBUTIONS_QUERY,
      variables: { login, from: from.toISOString(), to: to.toISOString() },
    }),
  });
  const rateLimit = readRateLimit(res);
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} for ${login}`);
  const body: ContributionsResponse = await res.json();
  if (body.errors?.length) throw new Error(`GraphQL ${login}: ${body.errors.map((e) => e.message).join("; ")}`);
  const user = body.data?.user;
  if (!user) throw new Error(`GraphQL ${login}: user not found`);
  const c = user.contributionsCollection;
  return {
    rateLimit,
    contributions: {
      totalCommitContributions: c.totalCommitContributions,
      restrictedContributionsCount: c.restrictedContributionsCount,
      days: c.contributionCalendar.weeks.flatMap((w) => w.contributionDays),
      repos: c.commitContributionsByRepository
        .filter((r) => !r.repository.isPrivate)
        .map((r) => ({
          nodeId: r.repository.id,
          nameWithOwner: r.repository.nameWithOwner,
          stargazerCount: r.repository.stargazerCount,
          isFork: r.repository.isFork,
          isPrivate: false,
          primaryLanguage: r.repository.primaryLanguage?.name ?? null,
          pushedAt: r.repository.pushedAt,
        })),
    },
  };
}

function unixWeekToDate(w: number): string {
  return new Date(w * 1000).toISOString().slice(0, 10);
}

/** One attempt. GitHub answers 202 while it computes stats in the background. */
export async function fetchContributorStats(
  token: string,
  nameWithOwner: string,
): Promise<{ result: ContributorStatsResult; rateLimit: RateLimit | null }> {
  const res = await fetch(`${API}/repos/${nameWithOwner}/stats/contributors`, { headers: headers(token) });
  const rateLimit = readRateLimit(res);
  if (res.status === 401) throw new GitHubAuthError(`token rejected for ${nameWithOwner}`);
  if (res.status === 202) return { result: { status: "pending" }, rateLimit };
  if (res.status === 204) return { result: { status: "ok", stats: [] }, rateLimit };
  if (res.status === 404 || res.status === 451) return { result: { status: "gone" }, rateLimit };
  if (!res.ok) throw new Error(`REST HTTP ${res.status} for ${nameWithOwner}`);
  const body: RestContributor[] = await res.json();
  const stats: ContributorStat[] = [];
  for (const c of body) {
    if (!c.author) continue;
    stats.push({
      authorNodeId: c.author.node_id,
      authorLogin: c.author.login,
      weeks: c.weeks
        .filter((w) => w.c > 0 || w.a > 0 || w.d > 0)
        .map((w) => ({ weekStart: unixWeekToDate(w.w), additions: w.a, deletions: w.d, commits: w.c })),
    });
  }
  return { result: { status: "ok", stats }, rateLimit };
}

type RestRepo = {
  node_id: string;
  full_name: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazers_count: number;
  pushed_at: string | null;
};

/** Who owns this token. Used to make sure people only connect their own tokens. */
export async function fetchTokenLogin(token: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (res.status === 401) throw new GitHubAuthError("token rejected");
  if (!res.ok) throw new Error(`REST HTTP ${res.status} for /user`);
  const body: { login: string } = await res.json();
  return body.login;
}

/**
 * Every repo the token can read that was pushed to since `since`. Fine-grained PATs never surface
 * private repos through GraphQL, so this is how private activity is discovered.
 */
export async function fetchAccessibleRepos(
  token: string,
  since: Date,
): Promise<{ repos: ActiveRepo[]; rateLimit: RateLimit | null }> {
  const repos: ActiveRepo[] = [];
  let rateLimit: RateLimit | null = null;
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${API}/user/repos?per_page=100&sort=pushed&page=${page}`, { headers: headers(token) });
    rateLimit = readRateLimit(res);
    if (res.status === 401) throw new GitHubAuthError("token rejected");
    if (!res.ok) throw new Error(`REST HTTP ${res.status} for /user/repos`);
    const body: RestRepo[] = await res.json();
    const recent = body.filter((r) => r.pushed_at !== null && new Date(r.pushed_at) >= since && !r.archived);
    repos.push(
      ...recent.map((r) => ({
        nodeId: r.node_id,
        nameWithOwner: r.full_name,
        stargazerCount: r.stargazers_count,
        isFork: r.fork,
        isPrivate: r.private,
        primaryLanguage: r.language,
        pushedAt: r.pushed_at,
      })),
    );
    // Sorted by pushed_at desc, so the first stale page ends the walk.
    if (body.length < 100 || recent.length < body.length) break;
  }
  return { repos, rateLimit };
}
