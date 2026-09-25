"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/Topbar";
import MachineCard from "@/components/MachineCard";
import { MACHINES } from "@/lib/machines";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMyStats } from "@/lib/data";

export default function MachinesPage() {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) {
      setUnlockedIds(new Set());
      return;
    }
    fetchMyStats(supabase, session.user.id).then((stats) => {
      setUnlockedIds(new Set(Object.values(stats).map((s) => s.machine_id)));
    });
  }, [session, supabase]);

  return (
    <>
      <Topbar />
      <div className="stack-lg">
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Machines</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {session ? `${unlockedIds.size} / 9 machines unlocked` : "All 9 machines in this gym"}
          </p>
        </div>
        <div className="stack">
          {MACHINES.map((m) => (
            <MachineCard key={m.id} machine={m} unlocked={unlockedIds.has(m.id)} showLock={!!session} />
          ))}
        </div>
      </div>
    </>
  );
}
