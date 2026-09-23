import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ChangelogEntry = { title: string; body: string };
export type ChangelogDay = { date: string; entries: ChangelogEntry[] };

const DAY = /^## (\d{4}-\d{2}-\d{2})$/;
const ENTRY = /^- \*\*(.+?)\*\* — (.+)$/;

/**
 * `docs/CHANGELOG.md` is the source; this reads the two shapes it is allowed to have and ignores
 * the rest, so the file stays readable in the repo without a markdown parser in the bundle.
 */
export function changelog(): ChangelogDay[] {
  const text = readFileSync(join(process.cwd(), "docs", "CHANGELOG.md"), "utf8");
  const days: ChangelogDay[] = [];
  for (const line of text.split("\n")) {
    const day = DAY.exec(line);
    if (day) {
      days.push({ date: day[1], entries: [] });
      continue;
    }
    const entry = ENTRY.exec(line);
    if (entry && days.length > 0) days[days.length - 1].entries.push({ title: entry[1], body: entry[2] });
  }
  return days;
}
