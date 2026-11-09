"use client";

// Last-resort error screen if the app shell itself fails. Has to render its
// own <html>/<body>, so it uses plain inline styles.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0a0c",
          color: "#f5f4f0",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Racked hit a snag</h1>
          <p style={{ opacity: 0.7, margin: "0 0 20px" }}>Please try again in a moment.</p>
          <button
            onClick={reset}
            style={{ background: "#ff5a36", color: "#1a0704", border: 0, borderRadius: 14, padding: "14px 22px", fontWeight: 800, fontSize: 15 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
