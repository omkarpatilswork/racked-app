"use client";

import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import { fmtNum, machineLabel } from "@/lib/fairplay";
import { timeAgo } from "@/lib/time";
import type { Database } from "@/lib/database.types";

type SetLogRow = Database["public"]["Views"]["v_admin_set_logs"]["Row"];

// One logged set in a staff list, with a remove button.
export default function SetRow({
  row,
  showMember = true,
  busy,
  onRemove,
}: {
  row: SetLogRow;
  showMember?: boolean;
  busy?: boolean;
  onRemove: (row: SetLogRow) => void;
}) {
  return (
    <div className="set-row" data-testid="set-row">
      {showMember && <Avatar name={row.display_name} url={row.avatar_url} size={34} />}
      <div className="sr-body">
        <div className="sr-title">
          <span className="num">
            {fmtNum(row.weight)} kg × {row.reps}
          </span>
          {row.is_pb && <span className="pill-yellow" style={{ padding: "2px 8px", fontSize: 10.5 }}>PB</span>}
          {row.review_status === "flagged" && (
            <span className="flag-pill" style={{ padding: "2px 8px", fontSize: 10.5 }}>
              Flagged
            </span>
          )}
        </div>
        <div className="sr-sub">
          {showMember ? `${row.display_name} · ` : ""}
          {machineLabel(row.machine_id, row.mode)} · {timeAgo(row.created_at)}
        </div>
      </div>
      <button
        type="button"
        className="icon-btn-danger"
        disabled={busy}
        onClick={() => onRemove(row)}
        aria-label={`Remove ${fmtNum(row.weight)} kg × ${row.reps} by ${row.display_name}`}
        data-testid="remove-set"
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}
