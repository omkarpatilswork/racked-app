"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { LoadError, MigrationNotice, SkeletonList, needsMigration } from "@/components/admin/shared";
import { adminActivity, type StaffActivity } from "@/lib/data";
import { machineLabel } from "@/lib/fairplay";
import { timeAgo } from "@/lib/time";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const ACTION: Record<string, { icon: string; text: (a: StaffActivity) => string }> = {
  remove_set: { icon: "trash", text: (a) => `removed ${a.target_name ?? "a member"}'s set on ${machineLabel(a.machine_id)}` },
  approve_set: { icon: "check", text: (a) => `approved ${a.target_name ?? "a member"}'s set on ${machineLabel(a.machine_id)}` },
  reset_member_machine: { icon: "refresh", text: (a) => `reset ${a.target_name ?? "a member"} on ${machineLabel(a.machine_id)}` },
  reset_machine: { icon: "refresh", text: (a) => `reset ${machineLabel(a.machine_id)} for everyone` },
  set_limit: { icon: "edit", text: (a) => `changed limits on ${machineLabel(a.machine_id)}` },
  reset_all: { icon: "trash", text: () => "reset all gym data" },
};

export default function ActivityTab({ supabase }: { supabase: SupabaseClient<Database> }) {
  const [rows, setRows] = useState<StaffActivity[] | null>(null);
  const [state, setState] = useState<"ok" | "missing" | "error">("ok");

  const load = useCallback(() => {
    setRows(null);
    adminActivity(supabase)
      .then((r) => {
        setRows(r);
        setState("ok");
      })
      .catch((err) => {
        setRows([]);
        setState(needsMigration(err) ? "missing" : "error");
      });
  }, [supabase]);
  useEffect(load, [load]);

  return (
    <div className="stack-lg" data-testid="tab-activity">
      <p className="faint" style={{ margin: 0, fontSize: 13 }}>
        Every staff action, newest first — so there&rsquo;s always a record of who changed what.
      </p>
      {rows === null ? (
        <SkeletonList rows={5} height={58} />
      ) : state === "missing" ? (
        <MigrationNotice what="the activity log" />
      ) : state === "error" ? (
        <LoadError onRetry={load} />
      ) : rows.length === 0 ? (
        <div className="card empty">No staff actions yet.</div>
      ) : (
        <div className="list">
          {rows.map((a) => {
            const meta = ACTION[a.action] ?? { icon: "info", text: () => a.action };
            return (
              <div key={a.id} className="list-row" style={{ cursor: "default", alignItems: "flex-start" }} data-testid="activity-row">
                <span className="lr-icon">
                  <Icon name={meta.icon} />
                </span>
                <span className="lr-body" style={{ fontWeight: 600, fontSize: 14 }}>
                  <b>{a.staff_name}</b> {meta.text(a)}
                  {a.detail && <div className="lr-sub">{a.detail}</div>}
                  <div className="lr-sub">{timeAgo(a.created_at)}</div>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
