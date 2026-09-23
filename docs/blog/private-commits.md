---
title: Counting your private GitHub commits without the repo scope
date: 2026-09-23
description: "GitHub has no stats-only permission. What an app with public scope can see, what fine-grained tokens hide, and how to count private commits locally."
slug: private-github-commits-without-repo-scope
---

I built gitstats so a few friends and I could compare how much we code: commits, lines added and deleted, streaks, per week, month and year. The first version read everything from GitHub, and it showed almost nothing about me. One public repo, 22 commits in a year. My contribution calendar on the same profile showed about 650 private contributions.

That gap is normal. Most of the code I write lives in private repos: my own projects, and my employer's. A stats page that only sees public repos measures how much you publish, not how much you work.

So I worked out what GitHub will actually tell an app about private activity, and what it will not. The short answer is that there is no permission that means "numbers only". This post is the long answer, with the exact endpoints and what each one returned, and then what I built instead.

## What an app with public scope can see

gitstats signs you in with GitHub and asks for two scopes: `read:user` and `user:email`. That is enough to know who you are. It is not enough to read any private repo, and that was the point.

With that, a server can make two useful calls per person:

1. GraphQL `user(login).contributionsCollection(from, to)`. This returns the contribution calendar (a count per day) and `commitContributionsByRepository`, the repos you committed to in that window, up to 100.
2. REST `GET /repos/{owner}/{repo}/stats/contributors`. This returns, per contributor, weekly additions, deletions and commits. It covers the default branch only, and it answers `202` while GitHub computes the numbers, so you retry until you get a `200`.

For public repos that is the whole picture. For private repos, two things leak through:

- The calendar can include private contributions as anonymous daily counts, but only if the user has turned on "include private contributions" on their profile.
- `restrictedContributionsCount`, one number for the window. It mixes commits, pull requests, issues and reviews, so it cannot tell you how much code anyone wrote.

## There is no stats-only permission

The weekly line counts in `stats/contributors` come from commit contents, so GitHub puts that endpoint behind the **Contents: read** permission on the repo. I could not find any permission that grants the numbers without also granting the ability to read the source.

`contributionsCollection` has a similar rule. It lists private repos only when you query it with the user's own OAuth token carrying the classic `repo` scope. Anything else gets the bare `restrictedContributionsCount`.

So if an app wants per-repo private numbers from GitHub, it has to hold a token that can read your code.

## The fine-grained token experiment

Fine-grained personal access tokens looked like the way out. You pick the account, you pick the repos, and you can grant Contents as read-only. I tested them on 2026-09-18 with my own tokens.

First, a baseline: a classic PAT with no scopes at all. GraphQL and REST both worked for public data, and the `x-oauth-scopes` response header was empty. Nothing surprising.

Then a fine-grained PAT with my personal account as the resource owner, access to all repositories, and **Contents: Read-only**:

- **GraphQL `contributionsCollection`:** no private repos listed. `restrictedContributionsCount` was 653.
- **REST `GET /user/repos?visibility=private`:** 19 private repos.
- **REST `GET /repos/{owner}/{repo}/stats/contributors`** on one of them: `202`, then `200` with real weekly rows.

The same token that GraphQL treats as unable to see my private repos can list them and read their weekly stats over REST. So if you want to use fine-grained tokens for this, discovery has to go through REST `/user/repos`, not through the contributions query. I have not found that written down anywhere, which is part of why I am writing this.

A few more things I learned while setting it up:

- A fine-grained token has one resource owner. Your personal account is one; each organization is another. Work repos mean a second token, created against the org.
- The organization I work for did show up as a selectable resource owner, so fine-grained tokens were enabled there. Org owners can see every active fine-grained token in the org settings: who owns it, its name, its permissions and which repos it covers.
- Fine-grained tokens expire, within a year at most.
- `stats/contributors` lists at most 100 contributors, counts only the default branch, and counts lockfiles and generated files as lines like any other.

gitstats does support this path. You can paste a read-only fine-grained token in settings; it is stored encrypted with AES-256-GCM and decrypted only inside the nightly job. It works. But it asks people to hand a server a token that can read their code, and for work repos it means creating a token your employer can see.

## What I ruled out

**The `repo` scope on sign-in.** It would have given me everything, and it grants read and write access to every repo the user can reach, including every organization they belong to. The app would also have to store that token and refresh it. For a leaderboard among friends, that is far too much. gitstats never asks for `repo` and never stores the OAuth token GitHub hands back at sign-in.

**A GitHub App installed on the organization.** This is the clean answer for companies. It also means an org admin has to install it. I did not want to ask my employer's admins to install something so I could compare commit counts with friends, and I did not want anyone else to have to either.

**An org-scoped fine-grained token.** It works if the org policy allows it without approval, and it would be visible to the org owners. I decided against it for the same reason.

**`restrictedContributionsCount` alone.** One number that mixes code with issues and reviews is not a line count.

## Counting where the code already is

Every number I wanted already exists in the clone on my laptop. `git log` can produce it without asking GitHub for anything. So the main way gitstats counts private work is a small CLI that runs on your computer.

In the background (every six hours on a Mac, daily on Linux and Windows), for each repo it finds, it runs:

```
git log <default branch> --no-merges --fixed-strings --numstat \
  --since=<one year ago> --author=<each of your emails>
```

It fetches the default branch first, so commits pushed from another machine are counted too. `--no-merges` keeps a merge commit's own diff from counting twice. `--fixed-strings` is there because GitHub's noreply address looks like `123+login@users.noreply.github.com`, and without it the `+` is read as a regex operator and the filter silently matches nothing. `--author` is a substring match, so the CLI then keeps only exact email matches. Your emails are your global git email, the repo's local one, your GitHub noreply address, and any you add.

From that output it builds weekly and daily buckets of commits, lines added and lines deleted, and guesses a language from the changed files' extensions, skipping lockfiles. It also counts recent work on remote branches that have not been merged yet, and sends that separately so it never counts toward a ranking.

What it sends for each repo:

- an HMAC-SHA256 of the repo's normalised remote URL, keyed with a secret unique to your account and issued when you pair the computer
- the language guess
- the weekly and daily numbers above

The repo name is sent only if you run `gitstats names on`. Otherwise a private repo shows up as `private-` followed by eight characters of the hash. Public repos are still recognised: the server computes the same HMAC over the `github.com/owner/name` repos it already knows and matches them without being told a name.

What it never sends: code, diffs, file or folder names, branch names, commit messages, remote URLs, or any GitHub token. The CLI does not need a GitHub token at all.

The hash has an honest limit. The server holds your key, so it can check a guess ("is this repo `github.com/acme/api`?") for one specific URL. It cannot turn a hash back into a URL or list your repos.

Pairing works like a TV login. The CLI shows a code, you confirm it on the website while signed in, and it gets a token of its own that can only upload numbers. Before the first upload it prints every repo it found with its totals and asks before sending anything.

The CLI is one TypeScript file, under a thousand lines, MIT licensed, with the compiled output committed next to it: [github.com/yaroslavhaidash/gitstats-cli](https://github.com/yaroslavhaidash/gitstats-cli). If you want to see what it would count before trusting it with anything, `npx @yaroslavhaidash/gitstats-cli stats` prints the same numbers for your repos and sends nothing.

## What this costs

Counting locally moves the problem rather than removing it.

- Only computers you link are counted. A repo you never cloned on a linked machine is invisible to the CLI. Link each computer you commit from.
- Commits count when their author email is one the CLI knows. If you committed under an old address, add it with `gitstats emails add`.
- The numbers that rank you come from the default branch. Branch work shows up, but on its own line, until it merges.
- Per-day lines come only from linked computers. A public repo GitHub knows about but that is not cloned on any linked machine has GitHub's weekly figures, and the site marks those days as placed rather than counted.

In return, nobody needs a token that can read their code, no employer has to approve anything, and the org never sees a thing.

If you want to try it with your own crew, it is at [gitstats.org](https://gitstats.org).
