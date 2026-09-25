/**
 * Seeds a fresh Supabase project with realistic demo data so you can see a
 * populated leaderboard/admin dashboard before any real member has signed
 * in. Safe to run against a project that already has real members — it
 * only ever touches the demo accounts it creates (emails ending in
 * @demo.rackedbybijlee.test), never real rows.
 *
 * Usage:
 *   1. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL
 *      and SUPABASE_SERVICE_ROLE_KEY (from Supabase -> Project Settings -> API).
 *   2. npm run seed
 *
 * This uses the service-role key to bypass RLS (that's the point of a seed
 * script), so never run it from the browser and never commit that key.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { MACHINES } from "../lib/machines";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill them in first."
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_NAMES = [
  "Aarav Sharma", "Priya Nair", "Kabir Mehta", "Ananya Iyer", "Rohan Verma",
  "Sanya Kapoor", "Vikram Singh", "Ishita Rao", "Aditya Joshi", "Meera Pillai",
  "Arjun Reddy", "Diya Malhotra", "Karan Chawla", "Neha Bhatt", "Yash Kulkarni",
];

function randRange(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 2) / 2;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function ensureDemoUser(name: string, index: number) {
  const email = `demo${index}@demo.rackedbybijlee.test`;
  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing.users.find((u) => u.email === email);
  if (found) return found.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create demo user ${email}: ${error?.message}`);
  }
  // The handle_new_user() trigger creates the profile row automatically;
  // give it a moment then confirm/patch the display name just in case.
  await supabase.from("profiles").update({ display_name: name }).eq("id", data.user.id);
  return data.user.id;
}

async function seedMachineStats(uid: string, seedIndex: number) {
  for (const machine of MACHINES) {
    // Not every demo user touches every machine — feels more realistic.
    if (Math.random() < 0.35) continue;

    const modes = machine.dual ? Object.keys(machine.modes!) : [""];
    for (const mode of modes) {
      if (machine.dual && Math.random() < 0.3) continue;
      const challenge = machine.dual ? machine.modes![mode].challenge : machine.challenge!;
      const skillFactor = 0.55 + Math.random() * 0.65; // some users are stronger than others
      const pbWeight = Math.max(machine.unit === "KG" ? 5 : 1, Math.round(challenge.weight * skillFactor * 2) / 2);
      const pbReps = Math.max(4, Math.round(challenge.reps * (0.8 + Math.random() * 0.5)));
      const sets = Math.round(5 + Math.random() * 40);
      const sessions = Math.max(1, Math.round(sets / (2 + Math.random() * 2)));
      const volume = Math.round(sets * pbWeight * pbReps * (0.6 + Math.random() * 0.3));
      const xp = 10 * sets + 50 * Math.round(sessions / 3) + 25 * (sessions - 1);
      const level = Math.max(1, Math.round(1 + xp / 350));
      const lastDate = daysAgo(Math.round(Math.random() * 6)).toISOString().slice(0, 10);

      // machine_stats has no client Insert/Update type (it's written only via
      // the log_set() RPC from the app) — the service-role key bypasses RLS
      // for this trusted, server-only seed script, so we cast past that
      // deliberate compile-time guard here.
      const { error } = await supabase.from("machine_stats").upsert(
        {
          uid,
          machine_id: machine.id,
          mode,
          pb_weight: pbWeight,
          pb_reps: pbReps,
          sets,
          sessions,
          volume,
          xp,
          level,
          last_date: lastDate,
          sets_today: 1,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "uid,machine_id,mode" }
      );
      if (error) console.error(`  machine_stats seed failed for ${uid}/${machine.id}:`, error.message);
    }
  }
  void seedIndex;
}

async function seedAttendance(uid: string) {
  // A semi-random streak over the last ~21 days.
  const rows: Database["public"]["Tables"]["attendance"]["Insert"][] = [];
  for (let i = 0; i < 21; i++) {
    if (Math.random() < 0.55) {
      rows.push({ uid, date: daysAgo(i).toISOString().slice(0, 10), present: true });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "uid,date" });
    if (error) console.error(`  attendance seed failed for ${uid}:`, error.message);
  }
}

async function seedFeedbackAndTaps() {
  const samples: { machineId: string; rating: number; issues: string[]; comment?: string }[] = [
    { machineId: "lat-pulldown-01", rating: 5, issues: ["good"] },
    { machineId: "chest-press-02", rating: 4, issues: [] },
    { machineId: "squat-07", rating: 2, issues: ["stack"], comment: "Weight stack sticks around 60kg." },
    { machineId: "leg-press-08", rating: 3, issues: ["clean"], comment: "Seat pad could use a wipe-down more often." },
    { machineId: "rowing-03", rating: 5, issues: ["good"] },
  ];
  for (const s of samples) {
    const { error } = await supabase.from("feedback").insert({
      uid: null,
      display_name: "Anonymous",
      machine_id: s.machineId,
      rating: s.rating,
      issues: s.issues,
      comment: s.comment ?? null,
    });
    if (error) console.error("  feedback seed failed:", error.message);
  }

  const tapRows: { machine_id: string }[] = [];
  for (const m of MACHINES) {
    const taps = Math.round(20 + Math.random() * 180);
    for (let i = 0; i < taps; i++) tapRows.push({ machine_id: m.id });
  }
  // Batch insert in chunks to stay well under any request size limits.
  for (let i = 0; i < tapRows.length; i += 500) {
    const chunk = tapRows.slice(i, i + 500);
    const { error } = await supabase.from("tap_events").insert(chunk as never);
    if (error) console.error("  tap_events seed failed:", error.message);
  }
}

async function main() {
  console.log(`Seeding ${DEMO_NAMES.length} demo members...`);
  for (let i = 0; i < DEMO_NAMES.length; i++) {
    const name = DEMO_NAMES[i];
    process.stdout.write(`  ${name}... `);
    const uid = await ensureDemoUser(name, i);
    await seedMachineStats(uid, i);
    await seedAttendance(uid);
    console.log("done");
  }
  console.log("Seeding feedback + tap analytics...");
  await seedFeedbackAndTaps();
  console.log("\nDone. Sign in with your own Google account, then run:");
  console.log("  update public.profiles set is_staff = true where id = '<your-user-id>';");
  console.log("in the Supabase SQL editor to see the seeded admin dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
