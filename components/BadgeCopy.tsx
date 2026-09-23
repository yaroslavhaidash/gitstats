"use client";

import { track } from "@vercel/analytics";
import Image from "next/image";
import { useState } from "react";
import { badgeMarkdown, badgePath } from "@/lib/badgeMarkdown";
import type { Preset } from "@/lib/window";
import { BadgeWindowTabs } from "./BadgeWindowTabs";
import { CopyText } from "./CopyText";

/**
 * The README badge Markdown, click to copy, under a WEEK/MONTH/YEAR toggle; `where` says which copy
 * button it was. With `preview` the badge itself is drawn above the snippet for the picked window.
 */
export function BadgeCopy({ login, where, preview = false }: { login: string; where: string; preview?: boolean }) {
  const [picked, setPicked] = useState<Preset>("year");
  return (
    <div>
      <BadgeWindowTabs current={picked} onPick={setPicked} />
      {preview && (
        <Image src={badgePath(login, picked)} alt="your gitstats README badge" width={420} height={120} className="block max-w-full h-auto mt-4" unoptimized />
      )}
      <CopyText
        text={badgeMarkdown(login, picked)}
        onCopy={() => track("badge_copy", { where })}
        className="block w-full text-xs text-silver break-all border-2 border-dark p-3 mt-4"
      />
    </div>
  );
}
