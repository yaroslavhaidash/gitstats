"use client";

import { track } from "@vercel/analytics";
import Image from "next/image";
import { useState } from "react";
import { badgeMarkdown, badgePath } from "@/lib/badgeMarkdown";
import { METRICS, PRESETS, type Metric, type Preset } from "@/lib/window";
import { BadgeTabs } from "./BadgeTabs";
import { CopyText } from "./CopyText";

/**
 * The README badge Markdown, click to copy, under LINES/COMMITS and WEEK/MONTH/YEAR toggles; `where` says which copy
 * button it was. With `preview` the badge itself is drawn above the snippet for the picked window.
 */
export function BadgeCopy({ login, where, preview = false }: { login: string; where: string; preview?: boolean }) {
  const [picked, setPicked] = useState<Preset>("year");
  const [metric, setMetric] = useState<Metric>("lines");
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <BadgeTabs options={METRICS} current={metric} onPick={setMetric} />
        <BadgeTabs options={PRESETS} current={picked} onPick={setPicked} />
      </div>
      {preview && (
        <Image src={badgePath(login, picked, metric)} alt="your gitstats README badge" width={420} height={120} className="block max-w-full h-auto mt-4" unoptimized />
      )}
      <CopyText
        text={badgeMarkdown(login, picked, metric)}
        onCopy={() => track("badge_copy", { where })}
        className="block w-full text-xs text-silver break-all border-2 border-dark p-3 mt-4"
      />
    </div>
  );
}
