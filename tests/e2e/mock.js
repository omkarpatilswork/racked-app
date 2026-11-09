// Shared Playwright harness for Racked: fake signed-in session + mocked
// Supabase REST/RPC/storage. See tests/README.md.
// Shared Playwright harness: fake signed-in session + mocked Supabase REST/RPC/storage.
// 1x1 grey JPEG used for every mocked photo
const IMG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const UID = "me-uid";
const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "omi@example.com", app_metadata: {}, user_metadata: { full_name: "Omi Patil" }, created_at: new Date().toISOString() };
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
const day = (o = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now + o * 86400000));

function defaultState() {
  return {
    signedIn: true,
    profile: { id: UID, display_name: "Omi Patil", avatar_url: null, instagram_handle: "omi.lifts", is_staff: false, created_at: iso(60 * 24 * 40), onboarded_at: iso(60 * 24 * 40) },
    stats: [
      { uid: UID, machine_id: "lat-pulldown-01", mode: "", pb_weight: 55, pb_reps: 10, sets: 34, sessions: 9, volume: 15400, xp: 620, level: 4, last_date: day(0), sets_today: 2, updated_at: iso(30) },
      { uid: UID, machine_id: "chest-press-02", mode: "", pb_weight: 45, pb_reps: 8, sets: 21, sessions: 6, volume: 7200, xp: 380, level: 3, last_date: day(-1), sets_today: 0, updated_at: iso(1500) },
      { uid: UID, machine_id: "leg-press-08", mode: "", pb_weight: 120, pb_reps: 12, sets: 18, sessions: 5, volume: 21000, xp: 300, level: 2, last_date: day(-3), sets_today: 0, updated_at: iso(4500) },
    ],
    attendance: [0, -1, -2, -4, -5, -6, -8].map((o) => ({ uid: UID, date: day(o), present: true, updated_at: iso(0) })),
    setLogs: [
      { id: 900, uid: UID, machine_id: "lat-pulldown-01", mode: "", weight: 50, reps: 10, volume: 500, is_pb: false, xp_gain: 20, created_at: iso(40) },
    ],
    photos: [],
    posts: [
      { post_id: 11, is_mine: false, display_name: "Asha Rao", avatar_url: null, instagram_handle: "asha.lifts", machine_id: "lat-pulldown-01", mode: "", sets: 4, weight: 60, reps: 8, volume: 1900, xp: 80, has_pb: true, started_at: iso(30), created_at: iso(12), kudos_count: 3, kudos_mine: false, kudos_names: ["Rahul", "Neha"] },
      { post_id: 12, is_mine: true, display_name: "Omi Patil", avatar_url: null, instagram_handle: "omi.lifts", machine_id: "chest-press-02", mode: "", sets: 3, weight: 45, reps: 8, volume: 1080, xp: 45, has_pb: false, started_at: iso(70), created_at: iso(55), kudos_count: 1, kudos_mine: false, kudos_names: ["Asha"] },
      { post_id: 13, is_mine: false, display_name: "Rahul Mehta", avatar_url: null, instagram_handle: null, machine_id: "leg-press-08", mode: "", sets: 5, weight: 140, reps: 10, volume: 7000, xp: 90, has_pb: false, started_at: iso(200), created_at: iso(180), kudos_count: 0, kudos_mine: false, kudos_names: [] },
    ],
    feedPhotos: [],
    overall: [
      { uid: "u1", display_name: "Asha Rao", avatar_url: null, total_xp: 2400, total_sets: 120, total_volume: 52000, pb_count: 14, unlocked: 8 },
      { uid: "u2", display_name: "Rahul Mehta", avatar_url: null, total_xp: 1900, total_sets: 98, total_volume: 61000, pb_count: 11, unlocked: 7 },
      { uid: UID, display_name: "Omi Patil", avatar_url: null, total_xp: 1300, total_sets: 73, total_volume: 43600, pb_count: 9, unlocked: 3 },
      { uid: "u4", display_name: "Neha Kulkarni", avatar_url: null, total_xp: 900, total_sets: 40, total_volume: 15000, pb_count: 5, unlocked: 4 },
      { uid: "u5", display_name: "Kabir S", avatar_url: null, total_xp: 400, total_sets: 18, total_volume: 6000, pb_count: 2, unlocked: 2 },
    ],
    machineBoard: [
      { machine_id: "lat-pulldown-01", mode: "", uid: "u1", display_name: "Asha Rao", avatar_url: null, pb_weight: 60, pb_reps: 8, xp: 700, level: 5, sets: 40, rank: 1 },
      { machine_id: "lat-pulldown-01", mode: "", uid: UID, display_name: "Omi Patil", avatar_url: null, pb_weight: 55, pb_reps: 10, xp: 620, level: 4, sets: 34, rank: 2 },
      { machine_id: "lat-pulldown-01", mode: "", uid: "u2", display_name: "Rahul Mehta", avatar_url: null, pb_weight: 50, pb_reps: 12, xp: 500, level: 4, sets: 30, rank: 3 },
      { machine_id: "lat-pulldown-01", mode: "", uid: "u4", display_name: "Neha Kulkarni", avatar_url: null, pb_weight: 35, pb_reps: 10, xp: 200, level: 2, sets: 12, rank: 4 },
    ],
    logResult: (w, r) => ({ isPb: w > 55, weight: w, reps: r, pbWeight: Math.max(55, w), pbReps: w > 55 ? r : 10, previousPb: { weight: 55, reps: 10 }, xpGain: w > 55 ? 60 : 20, totalXp: 1340, totalSets: 74, level: 4 }),
    calls: [],
    failRpc: {},
  };
}

async function setup(ctx, page, state, base) {
  if (state.signedIn) {
    await ctx.addCookies([{ name: "sb-placeholder-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
  }
  const json = (r, b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b), headers: { "access-control-allow-origin": "*" } });
  await page.route("**/auth/v1/**", (r) => {
    const u = r.request().url();
    state.calls.push("auth:" + u.split("/auth/v1/")[1]);
    if (u.includes("/logout")) return r.fulfill({ status: 204, body: "" });
    return json(r, u.includes("/user") ? user : session);
  });
  await page.route("**/rest/v1/**", (r) => {
    const req = r.request();
    const u = new URL(req.url());
    const p = u.pathname.replace("/rest/v1/", "");
    const accept = req.headers()["accept"] || "";
    const single = accept.includes("vnd.pgrst.object");
    state.calls.push(req.method() + " " + p + (req.postData() ? " " + req.postData() : ""));
    if (p.startsWith("rpc/")) {
      const name = p.slice(4);
      const body = JSON.parse(req.postData() || "{}");
      if (state.failRpc[name]) return json(r, { message: "boom" }, 500);
      switch (name) {
        case "feed_posts": return json(r, state.posts);
        case "feed_photos": return json(r, state.feedPhotos);
        case "leaderboard_overall": return json(r, state.overall);
        case "leaderboard_machine": return json(r, state.machineBoard.filter((x) => x.machine_id === body.p_machine_id));
        case "log_set": return json(r, state.logResult(body.p_weight, body.p_reps));
        case "toggle_kudos": return json(r, { count: 4, mine: true });
        case "set_instagram_handle": state.profile.instagram_handle = (body.p_handle || "").replace(/^@/, "").toLowerCase() || null; return json(r, state.profile.instagram_handle);
        case "update_my_profile": {
          if (body.p_display_name != null) state.profile.display_name = body.p_display_name.trim();
          if (body.p_onboarded) state.profile.onboarded_at = new Date().toISOString();
          return json(r, state.profile);
        }
        case "delete_my_account": state.deleted = true; return json(r, null);
        default: return json(r, []);
      }
    }
    if (p === "profiles") {
      if (req.method() === "PATCH") { Object.assign(state.profile, JSON.parse(req.postData() || "{}")); return json(r, state.profile); }
      return json(r, single ? state.profile : [state.profile]);
    }
    if (p === "machine_stats") {
      const mid = (u.searchParams.get("machine_id") || "").replace("eq.", "");
      const rows = mid ? state.stats.filter((s) => s.machine_id === mid) : state.stats;
      return single ? (rows[0] ? json(r, rows[0]) : json(r, { code: "PGRST116" }, 406)) : json(r, rows);
    }
    if (p === "attendance") return json(r, req.method() === "GET" ? state.attendance : []);
    if (p === "pump_photos") return json(r, state.photos);
    if (p === "set_logs") {
      const mid = (u.searchParams.get("machine_id") || "").replace("eq.", "");
      const rows = mid ? state.setLogs.filter((s) => s.machine_id === mid) : state.setLogs;
      return single ? (rows[0] ? json(r, rows[0]) : json(r, null)) : json(r, rows);
    }
    return json(r, []);
  });
  await page.route("**/storage/v1/**", (r) => {
    const u = r.request().url();
    if (u.includes("/object/sign/pump-photos") && r.request().method() === "POST") {
      const { paths } = JSON.parse(r.request().postData() || "{}");
      return json(r, (paths || []).map((p) => ({ path: p, signedURL: `/object/sign/pump-photos/${p}?token=t`, error: null })));
    }
    if (u.includes("/object/sign/")) return r.fulfill({ status: 200, contentType: "image/jpeg", body: IMG });
    if (u.includes("/object/list/")) { state.calls.push("storage:list"); return json(r, state.storageFiles || []); }
    if (r.request().method() === "DELETE") { state.calls.push("storage:delete " + (r.request().postData() || "")); state.storageFiles = []; return json(r, []); }
    return json(r, { Key: "x" });
  });
  await page.route("**/realtime/v1/**", (r) => r.abort());
}

module.exports = { defaultState, setup, UID, day, iso };
