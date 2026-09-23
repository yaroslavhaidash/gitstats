"use client";

/**
 * The last resort: a failure in the root layout itself, where no other boundary is mounted yet. It
 * has to render its own `<html>`, and it cannot rely on anything the layout would normally set up,
 * so the few styles it needs are inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#050505", color: "#e0e2e5", fontFamily: "ui-monospace, monospace", margin: 0 }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "0 16px", textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>That didn&apos;t load.</h1>
            <p style={{ fontSize: 14, color: "#aab2bf", margin: "0 0 24px" }}>Try again — it normally works the second time.</p>
            <button
              type="button"
              onClick={reset}
              style={{ background: "#ff3333", color: "#050505", border: 0, padding: "10px 20px", fontWeight: 700, cursor: "pointer", font: "inherit" }}
            >
              TRY AGAIN
            </button>
            {error.digest && <p style={{ fontSize: 12, color: "#8b93a4", marginTop: 32 }}>ref {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
