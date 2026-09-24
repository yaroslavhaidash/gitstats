# Roadmap

Where gitstats is heading. It is a direction, not a schedule: no dates, and the order changes when something more fun or more useful comes up. Ideas and PRs for anything here are welcome. Open an issue first so we can agree on the shape (see [CONTRIBUTING.md](CONTRIBUTING.md)).

What exists today: sign in with GitHub, crews with invite codes, a global board, personal pages with week/month/year windows, private and work repos counted by the [CLI](https://github.com/yaroslavhaidash/gitstats-cli) (numbers only), share cards, a README badge and a public demo.

## 1. More people on the board

gitstats is only as fun as the crew you compare with, so the first job is making it easy to bring friends in.

- **Easier invites:** one-click invite from the crew page, invite links that preview well in chats, and a nudge when a crew has only one member.
- **Smoother first minute:** less to read before your own numbers show up, and a clear next step after sign-in.
- **Things worth sharing:** a weekly recap card ("your week vs. your crew"), streak milestones, and year-in-review.

## 2. Doing things together

Right now you can look at your friends' numbers. Next is reacting to them.

- **Friends:** follow people outside your crews and see them on one board.
- **Reactions and kudos** on a streak, a big week or a new personal best.
- **Friendly challenges:** "most lines this week", "longest streak this month", opt-in and just for fun.
- **Messages:** short comments or a crew chat, if the lighter options above turn out not to be enough.

## 3. Better charts and your own dashboard

- **Dashboard personalisation:** pick, order and hide the charts on your page.
- **New views:** time of day and day of week patterns, language trends over time, per-repo deep dives and focus (how spread across repos a week was).
- **Comparisons:** you vs. your own last month or last year, side by side.

## 4. Open source and self-hosting

- Keep local development one command away with the demo seed.
- Make the gitstats.org-specific bits (domain, CLI server) configurable for self-hosters.
- Good first issues labelled for newcomers.

## Not planned

- **Anti-cheat or verification.** It is a game among friends; nobody is trying to cheat it.
- **Reading your code.** The GitHub `repo` scope is never requested, OAuth tokens are never stored, and the CLI sends numbers only. New features have to fit inside that promise.
