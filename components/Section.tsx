"use client";

import { usePathname, useRouter } from "next/navigation";
import { Component, Suspense, useTransition, type ReactNode } from "react";
import { reportBoundary } from "@/lib/actions";

/** The card that takes the failing section's place. Retrying re-runs the server render behind it. */
function Failed({ digest, reset }: { digest: string | null; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="panel p-6 font-mono text-xs flex flex-wrap items-center justify-between gap-3">
      <span className="text-dim">&gt; that didn&apos;t load{digest ? ` · ref ${digest}` : ""}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            reset();
            router.refresh();
          })
        }
        className="text-faint hover:text-alert transition-colors disabled:text-faint cursor-pointer"
      >
        {pending ? "[TRYING…]" : "[TRY AGAIN]"}
      </button>
    </div>
  );
}

type Props = { path: string; children: ReactNode };
type State = { digest: string | null; failed: boolean };

class Boundary extends Component<Props, State> {
  state: State = { digest: null, failed: false };

  static getDerivedStateFromError(error: Error & { digest?: string }): State {
    return { digest: error.digest ?? null, failed: true };
  }

  componentDidCatch(error: Error & { digest?: string }) {
    void reportBoundary(this.props.path, error.digest);
  }

  render() {
    return this.state.failed ? <Failed digest={this.state.digest} reset={() => this.setState({ digest: null, failed: false })} /> : this.props.children;
  }
}

/**
 * One card that can fail on its own. `error.tsx` replaces the whole route, which is the wrong size of
 * answer once the shell has already streamed: the nav, the header and the numbers above are on screen
 * and correct, and a blip on one query should not take them with it. The `Suspense` is what lets the
 * shell flush before this section's queries have answered, and the boundary sits outside it so a
 * rejection arriving after the flush lands here instead of cutting the response off mid-stream.
 */
export function Section({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Boundary path={usePathname()}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Boundary>
  );
}
