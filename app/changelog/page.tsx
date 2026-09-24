import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { changelog } from "@/lib/changelog";
import { openGraphFor } from "@/lib/site";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Everything that has shipped on gitstats, newest first: charts, privacy controls, the CLI, and the boards themselves.",
  alternates: { canonical: "/changelog" },
  openGraph: openGraphFor("/changelog"),
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function stamp(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** The only markup an entry may carry is `inline code`, so one split does the whole job. */
function Body({ text }: { text: string }): ReactNode {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="text-silver">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default async function Changelog() {
  const days = changelog();
  return (
    <main className="flex-1">
      <SiteNav
        where="changelog_nav"
        links={
          <>
            <Link href="/docs" className="hover:text-alert transition-colors">[DOCS]</Link>
            <Link href="/privacy" className="hover:text-alert transition-colors">[PRIVACY]</Link>
          </>
        }
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="tag mb-4">CHANGELOG</div>
        <h1 className="font-sans font-bold text-4xl mb-3">What shipped, newest first.</h1>
        <p className="font-mono text-sm text-dim leading-relaxed mb-12">
          Every change that reached the site, in the order it landed. One line each; nothing here is a plan.
        </p>

        {days.map((day) => (
          <section key={day.date} className="mb-12">
            <h2 className="font-mono text-xs text-faint border-b-2 border-dark pb-2 mb-5 tracking-wide">{stamp(day.date)}</h2>
            <ul className="flex flex-col gap-5">
              {day.entries.map((entry) => (
                <li key={entry.title} className="border-l-2 border-alert pl-5">
                  <h3 className="font-sans font-bold text-base mb-1">{entry.title}</h3>
                  <p className="font-mono text-xs text-dim leading-relaxed">
                    <Body text={entry.body} />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="font-mono text-xs text-faint">
          The site is <Link href="/docs" className="text-silver underline hover:text-alert">documented here</Link> and the CLI is open source at{" "}
          <a href="https://github.com/yaroslavhaidash/gitstats-cli" target="_blank" rel="noreferrer" className="text-silver underline hover:text-alert">
            github.com/yaroslavhaidash/gitstats-cli
          </a>.
        </p>
      </div>
    </main>
  );
}
