import Link from "next/link";
import type { ReactNode } from "react";

const BOX = "panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 font-mono text-xs text-dim";

/**
 * One line of first-run guidance where a board or a page would otherwise be all zeros. `inset` is for
 * the ones that stand in for a chart inside a card, which own no margin of their own.
 */
export function EmptyNote({ children, href, cta, inset = false }: { children: ReactNode; href?: string; cta?: string; inset?: boolean }) {
  const box = inset ? BOX : `${BOX} mb-8`;
  const body = (
    <>
      <span>&gt; {children}</span>
      {cta && <span className="font-bold whitespace-nowrap">{cta} →</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`${box} hover:border-silver hover:text-silver transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
