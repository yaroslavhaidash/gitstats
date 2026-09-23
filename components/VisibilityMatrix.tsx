import type { ReactNode } from "react";
import { updateProfile } from "@/lib/actions";
import type { ProfileVisibility, RepoNames } from "@/db/schema";
import { SettingsForm } from "./SettingsForm";

const radio = "accent-[#ff3333]";

const NAME_OPTIONS: { value: RepoNames; label: string }[] = [
  { value: "all", label: "all" },
  { value: "public_only", label: "public only" },
  { value: "none", label: "none" },
];

/** The note under a row, across all three columns so the row labels stay short on a phone. */
function Hint({ children }: { children: ReactNode }) {
  return <span className="col-span-3 -mt-3 text-xs text-faint">{children}</span>;
}

function Yes({ field, checked }: { field: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={field} defaultChecked={checked} className={radio} />
      <span className="text-xs">yes</span>
    </label>
  );
}

/** One column of the repo-names row: the same three choices for crewmates and for everyone. */
function NameColumn({ field, current }: { field: string; current: RepoNames }) {
  return (
    <span className="grid gap-1">
      {NAME_OPTIONS.map((o) => (
        <label key={o.value} className="flex items-center gap-2">
          <input type="radio" name={field} value={o.value} defaultChecked={current === o.value} className={radio} />
          <span className="text-xs whitespace-nowrap">{o.label}</span>
        </label>
      ))}
    </span>
  );
}

export type VisibilitySettings = {
  profileVisibility: ProfileVisibility;
  repoNames: RepoNames;
  repoNamesGlobal: RepoNames;
  sharePrivate: boolean;
  sharePrivateGlobal: boolean;
};

/** Who sees what, as one table: a row per question, a column for crewmates and one for everyone else. */
export function VisibilityMatrix({ me }: { me: VisibilitySettings }) {
  return (
    <SettingsForm action={updateProfile}>
      {/* At 375px the three columns do not fit: the question keeps a readable width and the card scrolls. */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[minmax(11rem,1fr)_auto_auto] gap-x-5 sm:gap-x-10 gap-y-5 items-start min-w-[25rem]">
          <span />
          <span className="text-xs text-faint uppercase tracking-wide">crewmates</span>
          <span className="text-xs text-faint uppercase tracking-wide">everyone</span>

          <span>open my page</span>
          <span className="text-xs text-faint">always</span>
          <Yes field="profileEveryone" checked={me.profileVisibility === "everyone"} />
          <Hint>your row on the boards stays visible either way</Hint>

          <span>count my private repos</span>
          <Yes field="sharePrivate" checked={me.sharePrivate} />
          <span className="grid gap-1">
            <Yes field="sharePrivateGlobal" checked={me.sharePrivateGlobal} />
            <span className="text-xs text-faint max-w-40 leading-snug">off = your global row shows public repos only</span>
          </span>
          <Hint>off = they see public-only numbers; you always see everything</Hint>

          <span>show repo names</span>
          <NameColumn field="repoNames" current={me.repoNames} />
          <NameColumn field="repoNamesGlobal" current={me.repoNamesGlobal} />
          <Hint>hidden names are masked for everyone else and get no repo page</Hint>
        </div>
      </div>
    </SettingsForm>
  );
}
