/**
 * "Compare with me": the visitor types their own handle and lands on `/vs/<them>/<visitor>`. A plain
 * GET form to `/vs`, which counts the pair and redirects, so Enter submits before any JavaScript.
 */
export function CompareForm({ login }: { login: string }) {
  return (
    <form action="/vs" className="flex flex-col sm:flex-row gap-4 max-w-lg">
      <input type="hidden" name="a" value={login} />
      <input
        name="b"
        required
        maxLength={39}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="your GitHub handle"
        aria-label="your GitHub handle"
        className="flex-1 min-w-0 bg-void border-2 border-dark px-4 py-4 font-mono text-sm focus:border-silver outline-none"
      />
      <button className="btn-brutal px-8 py-4">COMPARE WITH ME_</button>
    </form>
  );
}
