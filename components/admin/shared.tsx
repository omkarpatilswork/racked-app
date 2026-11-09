"use client";

import Icon from "@/components/Icon";

// Little pieces shared by the staff console tabs.

export function needsMigration(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}

export function MigrationNotice({ what }: { what: string }) {
  return (
    <div className="card" data-testid="needs-0010">
      <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
        <span className="tapin-icons" aria-hidden="true">
          <Icon name="info" />
        </span>
        <div>
          <b>Turn on {what}</b>
          <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
            Run database update <span className="num">0010_staff_moderation.sql</span> in Supabase → SQL Editor, then refresh.
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card empty">
      <div style={{ fontWeight: 800, color: "var(--ink)" }}>Couldn&rsquo;t load this</div>
      <p style={{ margin: "4px 0 12px", fontSize: 13.5 }}>Check the connection and try again.</p>
      <button type="button" className="btn btn-primary btn-sm" style={{ margin: "0 auto" }} onClick={onRetry}>
        <Icon name="refresh" /> Try again
      </button>
    </div>
  );
}

export function SkeletonList({ rows = 3, height = 72 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: 18 }} />
      ))}
    </div>
  );
}
