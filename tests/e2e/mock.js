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

// Rewards fixtures (0011_rewards.sql shapes)
const hrs = (h) => new Date(now + h * 3600000).toISOString();
function rewardsFixtures() {
  const sponsors = [
    { id: "jersey-drip", name: "Jersey Drip", tagline: "Premium football, cricket & F1 jerseys", blurb: "Jerseys with your name and number.", website_url: "https://jerseydrip.shop", instagram_url: null, logo_url: null, category: "Apparel",
      products: [
        { id: 1, title: "Football jerseys", subtitle: "Club and country kits", price_text: null, image_url: null, url: "https://jerseydrip.shop" },
        { id: 2, title: "Cricket jerseys", subtitle: "India and league styles", price_text: null, image_url: null, url: "https://jerseydrip.shop" },
      ] },
    { id: "clean-crate", name: "The Clean Crate", tagline: "Fuel your vibe, naturally", blurb: "Ready-to-eat protein oats: 15 g protein a pack.", website_url: "https://www.thecleancratefoods.com", instagram_url: null, logo_url: "https://www.thecleancratefoods.com/logo-new.jpg", category: "Nutrition",
      products: [
        { id: 5, title: "Mocha Rush", subtitle: "15 g protein · box of 4", price_text: "₹379", image_url: "https://www.thecleancratefoods.com/photos/DSC_8741.jpg", url: "https://www.thecleancratefoods.com" },
        { id: 6, title: "Thai Mango Coconut", subtitle: "15 g protein · box of 4", price_text: "₹379", image_url: "https://www.thecleancratefoods.com/photos/DSC_8723.jpg", url: "https://www.thecleancratefoods.com" },
      ] },
  ];
  const missions = [
    { id: "sets15", title: "Log 15 sets", description: "Any machine, any weight.", metric: "sets", target: 15, xp: 60, icon: "dumbbell", sort: 1 },
    { id: "days3", title: "Train 3 days", description: "Log at least one set on 3 different days.", metric: "days", target: 3, xp: 75, icon: "flame", sort: 2 },
    { id: "machines4", title: "Use 4 machines", description: "Spread the work: 4 different machines.", metric: "machines", target: 4, xp: 50, icon: "grid", sort: 3 },
    { id: "pb1", title: "Beat a personal best", description: "Beat your best on any machine you've used before.", metric: "pbs", target: 1, xp: 50, icon: "trophy", sort: 4 },
    { id: "volume5k", title: "Move 5,000 kg", description: "Weight × reps, added up over the week.", metric: "volume", target: 5000, xp: 75, icon: "bolt", sort: 5 },
  ];
  const badges = [
    ["first_set", "First rep", "Log your first set.", 20, "dumbbell"], ["first_pb", "Personal best", "Beat your best on a machine for the first time.", 30, "trophy"],
    ["early_bird", "Early bird", "Log a set before 7 am.", 30, "sun"], ["regular", "Regular", "Train on 10 different days.", 75, "flame"],
    ["explorer", "Explorer", "Log a set on all 10 machines.", 100, "grid"], ["tonne_day", "Tonne day", "Move 1,000 kg in a single day.", 50, "bolt"],
    ["century", "Century", "Log 100 sets.", 100, "medal"], ["ten_tonne", "10-tonne club", "Move 10,000 kg in total.", 100, "star"],
    ["podium", "Podium", "Finish in the top 3 of a season.", 150, "target"],
  ].map(([id, title, description, xp, icon], i) => ({ id, title, description, xp, icon, sort: i + 1 }));
  const prizes = [
    { id: 1, rank_from: 1, rank_to: 1, title: "Gift hamper from Jersey Drip × The Clean Crate", description: "For the season's top performer.", sponsor_ids: ["jersey-drip", "clean-crate"] },
    { id: 2, rank_from: 2, rank_to: 5, title: "Partner coupons", description: "Discount coupons from Jersey Drip and The Clean Crate.", sponsor_ids: ["jersey-drip", "clean-crate"] },
  ];
  const season = { id: 7, title: "Week of 16 Nov", period: "week", starts_at: hrs(-30), ends_at: hrs(80), prizes, players: 6 };
  const shop = [
    { id: 11, sponsor_id: "clean-crate", title: "Protein oats, 1 pack", description: "One 60 g pack of The Clean Crate protein oats (15 g protein).", image_url: null, xp_cost: 600, code_mode: "desk", stock_left: 18, per_member_limit: 1, valid_until: null },
    { id: 12, sponsor_id: "jersey-drip", title: "₹150 off at Jersey Drip", description: "A discount on any jersey at jerseydrip.shop.", image_url: null, xp_cost: 1000, code_mode: "pool", stock_left: null, per_member_limit: 1, valid_until: null },
    { id: 13, sponsor_id: "clean-crate", title: "Breakfast Box (8 packs)", description: "The Clean Crate Breakfast Box, both flavours.", image_url: null, xp_cost: 3000, code_mode: "desk", stock_left: 3, per_member_limit: 1, valid_until: null },
    { id: 14, sponsor_id: "jersey-drip", title: "Custom Jersey Drip jersey", description: "A jersey of your choice with your name and number.", image_url: null, xp_cost: 6000, code_mode: "desk", stock_left: 0, per_member_limit: 1, valid_until: null },
  ];
  const challenges = [
    { id: 3, sponsor_id: "clean-crate", title: "Clean Crate Leg Day", description: "Heaviest Leg Press set this week wins. Everyone who joins gets +20 XP.", metric: "best_lift", machine_id: "leg-press-08", mode: null, starts_at: hrs(-30), ends_at: hrs(80), prize: "A box of The Clean Crate protein oats", winners: 1, join_xp: 20, players: 4, leader: { name: "Rahul", value: 140, reps: 10 } },
  ];
  const overview = { period: "week", season, sponsors, shop, challenges, missions, badges, streak_steps: [{ days: 3, xp: 30 }, { days: 7, xp: 75 }, { days: 14, xp: 150 }, { days: 30, xp: 400 }],
    last_winners: { season: "Week of 9 Nov", winners: [{ rank: 1, name: "Asha", score: 980, prize: prizes[0].title }, { rank: 2, name: "Rahul", score: 760, prize: "Partner coupons" }, { rank: 3, name: "Omi", score: 610, prize: "Partner coupons" }] } };
  const my = {
    wallet: { training: 1300, bonus: 240, spent: 0, on_hold: 60, lifetime: 1540, balance: 1540 },
    season: { id: 7, title: season.title, period: "week", ends_at: season.ends_at, rank: 3, score: 380, players: 6, ahead: { name: "Rahul", score: 420 }, top_prize: prizes[0].title },
    week: { sets: 9, days: 3, machines: 3, pbs: 1, volume: 4200 },
    missions_done: ["days3", "pb1"],
    streak: { days: 3, started: day(-2), claimed: [3] },
    badges: [{ id: "first_set", at: iso(60 * 24 * 30) }, { id: "first_pb", at: iso(60 * 24 * 20) }, { id: "regular", at: iso(60 * 24 * 2) }],
    redemptions: [{ id: 41, title: "Partner coupons", sponsor_id: "jersey-drip", source: "prize", code: "RK-7F3A2C", code_mode: "desk", how_to_use: null, xp_spent: 0, status: "issued", rank: 3, created_at: iso(60 * 24) }],
    claimed_rewards: {},
    challenges: [{ id: 3, rank: 2, value: 120, reps: 12 }],
    recent: [],
  };
  const board = [
    { rank: 1, name: "Asha", score: 520, is_me: false }, { rank: 2, name: "Rahul", score: 420, is_me: false }, { rank: 3, name: "Omi", score: 380, is_me: true },
    { rank: 4, name: "Neha", score: 300, is_me: false }, { rank: 5, name: "Kabir", score: 160, is_me: false }, { rank: 6, name: "Dev", score: 40, is_me: false },
  ];
  const challengeBoard = [{ rank: 1, name: "Rahul", value: 140, reps: 10, is_me: false }, { rank: 2, name: "Omi", value: 120, reps: 12, is_me: true }, { rank: 3, name: "Asha", value: 100, reps: 8, is_me: false }];
  const admin = {
    period: "week",
    season: { id: 7, title: season.title, period: "week", starts_at: season.starts_at, ends_at: season.ends_at, awarded_at: null },
    season_prizes: prizes, templates: prizes,
    live_board: board.map((b) => ({ rank: b.rank, name: { Asha: "Asha Rao", Rahul: "Rahul Mehta", Omi: "Omi Patil", Neha: "Neha Kulkarni", Kabir: "Kabir S", Dev: "Dev" }[b.name], score: b.score, flagged: b.name === "Kabir" ? 1 : 0 })),
    to_award: [{ id: 6, title: "Week of 9 Nov", ends_at: hrs(-30), board: [
      { rank: 1, name: "Asha Rao", score: 980, flagged: 0, prize: prizes[0].title }, { rank: 2, name: "Rahul Mehta", score: 760, flagged: 0, prize: "Partner coupons" },
      { rank: 3, name: "Kabir S", score: 640, flagged: 2, prize: "Partner coupons" }, { rank: 4, name: "Omi Patil", score: 610, flagged: 0, prize: "Partner coupons" } ] }],
    seasons: [{ id: 6, title: "Week of 9 Nov", period: "week", starts_at: hrs(-198), ends_at: hrs(-30), awarded_at: null, winners: [] }],
    rewards: shop.map((r) => ({ ...r, how_to_use: null, stock: r.stock_left, active: r.id !== 14, sort: r.id, issued: r.id === 11 ? 2 : 0, codes_left: r.id === 12 ? 25 : 0, shared_code: null })),
    challenges: challenges.map((c) => ({ ...c, active: true, awarded_at: null, reward_id: null, top: challengeBoard.map((x) => ({ rank: x.rank, name: x.name, value: x.value, reps: x.reps })) })),
    sponsors: sponsors.map((sp, i) => ({ ...sp, active: true, sort: i + 1, products: sp.products.map((p, j) => ({ ...p, active: true, sort: j + 1, sponsor_id: sp.id })), clicks_7d: 14 + i, clicks_30d: 52 + i, redeemed_30d: 3 })),
    redemptions: [
      { id: 41, title: "Partner coupons", code: "RK-7F3A2C", source: "prize", status: "issued", rank: 3, xp_spent: 0, created_at: iso(60 * 24), fulfilled_at: null, member: "Omi Patil", sponsor_id: "jersey-drip" },
      { id: 42, title: "Protein oats, 1 pack", code: "RK-91BC0D", source: "shop", status: "issued", rank: null, xp_spent: 600, created_at: iso(300), fulfilled_at: null, member: "Asha Rao", sponsor_id: "clean-crate" },
    ],
  };
  return { overview, my, board, challengeBoard, admin, syncAwards: [] };
}

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
    rewards: rewardsFixtures(),
    calls: [],
    failRpc: {},
    missingRpc: {}, // name -> true: behave as if migration 0010 isn't run
    limits: [
      { machine_id: "lat-pulldown-01", max_weight: 150, max_reps: 50, jump_pct: 40, updated_at: iso(1000), updated_by: null },
      { machine_id: "chest-press-02", max_weight: 150, max_reps: 50, jump_pct: 40, updated_at: iso(1000), updated_by: null },
      { machine_id: "leg-press-08", max_weight: 400, max_reps: 50, jump_pct: 40, updated_at: iso(1000), updated_by: null },
    ],
    notices: [],
    tvBoards: [
      { machine_id: "lat-pulldown-01", mode: "", rank: 1, name: "Asha", pb_weight: 60, pb_reps: 8, sets: 4 },
      { machine_id: "lat-pulldown-01", mode: "", rank: 2, name: "Omi", pb_weight: 55, pb_reps: 10, sets: 3 },
      { machine_id: "lat-pulldown-01", mode: "", rank: 3, name: "Rahul", pb_weight: 50, pb_reps: 12, sets: 5 },
      { machine_id: "lat-pulldown-01", mode: "", rank: 4, name: "Neha", pb_weight: 35, pb_reps: 10, sets: 3 },
      { machine_id: "lat-pulldown-01", mode: "", rank: 5, name: "Kabir", pb_weight: 30, pb_reps: 12, sets: 2 },
      { machine_id: "leg-press-08", mode: "", rank: 1, name: "Rahul", pb_weight: 140, pb_reps: 10, sets: 5 },
      { machine_id: "leg-press-08", mode: "", rank: 2, name: "Asha", pb_weight: 120, pb_reps: 10, sets: 4 },
      { machine_id: "chest-press-02", mode: "", rank: 1, name: "Omi", pb_weight: 45, pb_reps: 8, sets: 3 },
      { machine_id: "pec-fly-rear-delt-04", mode: "pec-fly", rank: 1, name: "Neha", pb_weight: 30, pb_reps: 12, sets: 3 },
    ],
    tvActivity: [
      { person: 1, machine_id: "lat-pulldown-01", mode: "", sets: 4, volume: 1900, pbs: 1 },
      { person: 1, machine_id: "leg-press-08", mode: "", sets: 4, volume: 4800, pbs: 0 },
      { person: 2, machine_id: "lat-pulldown-01", mode: "", sets: 3, volume: 1650, pbs: 0 },
      { person: 2, machine_id: "chest-press-02", mode: "", sets: 3, volume: 1080, pbs: 1 },
      { person: 3, machine_id: "lat-pulldown-01", mode: "", sets: 5, volume: 3000, pbs: 1 },
      { person: 3, machine_id: "leg-press-08", mode: "", sets: 5, volume: 7000, pbs: 1 },
      { person: 4, machine_id: "lat-pulldown-01", mode: "", sets: 3, volume: 1050, pbs: 0 },
      { person: 4, machine_id: "pec-fly-rear-delt-04", mode: "pec-fly", sets: 3, volume: 1080, pbs: 0 },
      { person: 5, machine_id: "lat-pulldown-01", mode: "", sets: 2, volume: 720, pbs: 0 },
    ],
    queue: [
      { id: 501, uid: "u5", display_name: "Kabir S", avatar_url: null, machine_id: "lat-pulldown-01", mode: null, weight: 140, reps: 10, is_pb: true, review_reason: "Jumped from 50 kg to 140 kg (+180%)", created_at: iso(20), prev_best: 50, member_sets: 6 },
      { id: 502, uid: "u4", display_name: "Neha Kulkarni", avatar_url: null, machine_id: "leg-press-08", mode: null, weight: 340, reps: 8, is_pb: true, review_reason: "First set on this machine at 340 kg, near its 400 kg max", created_at: iso(90), prev_best: null, member_sets: 1 },
    ],
    adminSets: [
      { id: 501, uid: "u5", display_name: "Kabir S", avatar_url: null, machine_id: "lat-pulldown-01", mode: null, weight: 140, reps: 10, volume: 1400, is_pb: true, xp_gain: 60, created_at: iso(20), review_status: "flagged", review_reason: "Jumped" },
      { id: 600, uid: "u1", display_name: "Asha Rao", avatar_url: null, machine_id: "lat-pulldown-01", mode: null, weight: 60, reps: 8, volume: 480, is_pb: false, xp_gain: 10, created_at: iso(30), review_status: null, review_reason: null },
      { id: 601, uid: "u2", display_name: "Rahul Mehta", avatar_url: null, machine_id: "leg-press-08", mode: null, weight: 140, reps: 10, volume: 1400, is_pb: false, xp_gain: 10, created_at: iso(200), review_status: null, review_reason: null },
    ],
    members: [
      { id: "u1", display_name: "Asha Rao", avatar_url: null, is_staff: false, total_sets: 120, last_set_at: iso(30), flagged: 0, joined_at: iso(60 * 24 * 60) },
      { id: "u5", display_name: "Kabir S", avatar_url: null, is_staff: false, total_sets: 18, last_set_at: iso(20), flagged: 1, joined_at: iso(60 * 24 * 10) },
    ],
    memberStats: [
      { uid: "u5", machine_id: "lat-pulldown-01", mode: "", pb_weight: 140, pb_reps: 10, sets: 6, sessions: 3, volume: 4000, xp: 200, level: 2, last_date: day(0), sets_today: 1, updated_at: iso(20) },
    ],
    activity: [
      { id: 1, staff_name: "Omi Patil", action: "set_limit", target_name: null, machine_id: "leg-press-08", detail: "max 400 kg, 50 reps, flag jumps over 40%", created_at: iso(300) },
    ],
    taps: [
      { machine_id: "lat-pulldown-01", source: "nfc" }, { machine_id: "lat-pulldown-01", source: "qr" }, { machine_id: "leg-press-08", source: "nfc" },
    ],
    feedback: [
      { id: 71, uid: "u1", display_name: "Asha", machine_id: "leg-press-08", rating: 2, issues: ["stack"], comment: "Pin sticks at 100", status: "open", created_at: iso(400) },
      { id: 72, uid: "u2", display_name: "Rahul", machine_id: "rowing-03", rating: 4, issues: ["clean"], comment: null, status: "open", created_at: iso(800) },
    ],
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
      if (state.missingRpc[name]) return json(r, { code: "PGRST202", message: "Could not find the function" }, 404);
      const staffOnly = () => json(r, { code: "42501", message: "staff only" }, 403);
      switch (name) {
        case "admin_review_queue": return state.profile.is_staff ? json(r, state.queue) : staffOnly();
        case "admin_approve_set": state.queue = state.queue.filter((x) => x.id !== body.p_id); state.adminSets.forEach((x) => { if (x.id === body.p_id) x.review_status = "approved"; }); return json(r, null);
        case "admin_remove_set": state.queue = state.queue.filter((x) => x.id !== body.p_id); state.adminSets = state.adminSets.filter((x) => x.id !== body.p_id); return json(r, null);
        case "admin_delete_set_log": state.queue = state.queue.filter((x) => x.id !== body.p_id); state.adminSets = state.adminSets.filter((x) => x.id !== body.p_id); return json(r, null);
        case "admin_reset_member_machine": { const n = state.adminSets.filter((x) => x.uid === body.p_uid && x.machine_id === body.p_machine_id).length; state.memberStats = state.memberStats.filter((x) => !(x.uid === body.p_uid && x.machine_id === body.p_machine_id)); return json(r, n || 6); }
        case "admin_reset_machine_for_all": return json(r, 3);
        case "admin_set_machine_limit": { const l = state.limits.find((x) => x.machine_id === body.p_machine_id); if (l) Object.assign(l, { max_weight: body.p_max_weight, max_reps: body.p_max_reps, jump_pct: body.p_jump_pct }); return json(r, null); }
        case "admin_member_search": return json(r, state.members.filter((m) => !body.p_query || m.display_name.toLowerCase().includes(String(body.p_query).toLowerCase())));
        case "admin_activity": return json(r, state.activity);
        case "admin_delete_feedback": state.feedback = state.feedback.filter((f) => f.id !== body.p_id); return json(r, null);
        case "admin_clear_feedback": state.feedback = []; return json(r, null);
        case "admin_reset_all_data": return json(r, null);
        case "mark_notices_seen": state.notices.forEach((n) => { if ((body.p_ids || []).includes(n.id)) n.seen_at = new Date().toISOString(); }); return json(r, null);
        case "rewards_overview": return json(r, state.rewards.overview);
        case "my_rewards": return state.signedIn ? json(r, state.rewards.my) : json(r, { code: "42501", message: "Sign in first" }, 401);
        case "sync_my_rewards": { const a = state.rewards.syncAwards; state.rewards.syncAwards = []; return json(r, a); }
        case "season_board": return json(r, state.rewards.board.slice(0, body.p_limit || 10).map((x) => ({ ...x, is_me: state.signedIn && x.is_me })));
        case "challenge_board": return json(r, state.rewards.challengeBoard.map((x) => ({ ...x, is_me: state.signedIn && x.is_me })));
        case "track_sponsor_click": return json(r, null);
        case "redeem_reward": {
          const it = state.rewards.overview.shop.find((x) => x.id === body.p_reward_id);
          const w = state.rewards.my.wallet;
          if (!it) return json(r, { code: "RK101", message: "This reward isn't available right now" }, 400);
          if (w.balance < it.xp_cost) return json(r, { code: "RK104", message: `You need ${it.xp_cost - w.balance} more XP for this` }, 400);
          if (state.rewards.my.claimed_rewards[String(it.id)]) return json(r, { code: "RK103", message: "You've already claimed this one" }, 400);
          w.balance -= it.xp_cost; w.spent += it.xp_cost;
          state.rewards.my.claimed_rewards[String(it.id)] = 1;
          const code = it.code_mode === "pool" ? "JD-150-XK2" : "RK-4D21FA";
          state.rewards.my.redemptions.unshift({ id: 99, title: it.title, sponsor_id: it.sponsor_id, source: "shop", code, code_mode: it.code_mode, how_to_use: null, xp_spent: it.xp_cost, status: "issued", rank: null, created_at: new Date().toISOString() });
          return json(r, { id: 99, title: it.title, code, code_mode: it.code_mode, how_to_use: null, sponsor_id: it.sponsor_id, xp_spent: it.xp_cost, balance: w.balance });
        }
        case "admin_rewards_data": return state.profile.is_staff ? json(r, state.rewards.admin) : staffOnly();
        case "admin_set_season_period": state.rewards.admin.period = body.p_period; return json(r, null);
        case "admin_save_prizes": state.rewards.admin.templates = body.p_prizes; if (body.p_apply_current) state.rewards.admin.season_prizes = body.p_prizes; return json(r, null);
        case "admin_award_season": { const s = state.rewards.admin.to_award.find((x) => x.id === body.p_season_id); state.rewards.admin.to_award = state.rewards.admin.to_award.filter((x) => x.id !== body.p_season_id); return json(r, (s ? s.board : []).map((b) => ({ rank: b.rank, prize: b.prize }))); }
        case "admin_update_redemption": state.rewards.admin.redemptions.forEach((x) => { if (x.id === body.p_id) { x.status = body.p_status; x.fulfilled_at = new Date().toISOString(); } }); return json(r, null);
        case "admin_save_reward": { const p = body.p; if (p.id) { const x = state.rewards.admin.rewards.find((y) => String(y.id) === String(p.id)); Object.assign(x, { ...p, id: x.id, xp_cost: p.xp_cost === "" ? null : Number(p.xp_cost ?? x.xp_cost) }); return json(r, x.id); } const id = 100 + state.rewards.admin.rewards.length; state.rewards.admin.rewards.push({ ...p, id, xp_cost: p.xp_cost ? Number(p.xp_cost) : null, issued: 0, codes_left: 0, shared_code: null, sort: 0 }); return json(r, id); }
        case "admin_add_reward_codes": { const n = String(body.p_codes || "").split(/[\n,;]+/).filter((x) => x.trim()).length; const x = state.rewards.admin.rewards.find((y) => y.id === body.p_reward_id); if (x) { if (body.p_shared) { x.shared_code = body.p_codes.trim(); x.code_mode = "shared"; } else { x.codes_left += n; x.code_mode = "pool"; } } return json(r, body.p_shared ? 1 : n); }
        case "admin_save_challenge": { const p = body.p; if (p.id) { const x = state.rewards.admin.challenges.find((y) => String(y.id) === String(p.id)); Object.assign(x, { ...p, id: x.id }); return json(r, x.id); } const id = 50 + state.rewards.admin.challenges.length; state.rewards.admin.challenges.push({ ...p, id, players: 0, top: [], awarded_at: null }); return json(r, id); }
        case "admin_award_challenge": state.rewards.admin.challenges.forEach((x) => { if (x.id === body.p_id) x.awarded_at = new Date().toISOString(); }); return json(r, [{ rank: 1 }]);
        case "admin_save_sponsor": { const p = body.p; const x = state.rewards.admin.sponsors.find((y) => y.id === p.id); if (x) Object.assign(x, p); else state.rewards.admin.sponsors.push({ ...p, products: [], clicks_7d: 0, clicks_30d: 0, redeemed_30d: 0 }); return json(r, p.id); }
        case "admin_save_product": { const p = body.p; const sp = state.rewards.admin.sponsors.find((y) => y.id === p.sponsor_id); if (p.id) { sp.products.forEach((x) => { if (String(x.id) === String(p.id)) Object.assign(x, { ...p, id: x.id }); }); return json(r, p.id); } const id = 200 + sp.products.length; sp.products.push({ ...p, id }); return json(r, id); }
        case "admin_delete_product": state.rewards.admin.sponsors.forEach((sp) => { sp.products = sp.products.filter((x) => x.id !== body.p_id); }); return json(r, null);
        case "admin_bonus_xp": return json(r, null);
        case "tv_boards": return json(r, state.tvBoards);
        case "tv_activity": return json(r, state.tvActivity);
        case "feed_posts": return json(r, state.posts);
        case "feed_photos": return json(r, state.feedPhotos);
        case "leaderboard_overall": return json(r, state.overall);
        case "leaderboard_machine": return json(r, state.machineBoard.filter((x) => x.machine_id === body.p_machine_id));
        case "log_set": {
          const lim = state.limits.find((x) => x.machine_id === body.p_machine_id);
          if (lim && body.p_weight > lim.max_weight) return json(r, { code: "RK001", message: `That's more than this machine goes up to (${lim.max_weight} kg max). Check the weight and try again.` }, 400);
          return json(r, state.logResult(body.p_weight, body.p_reps));
        }
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
    if (p === "machine_stats" && (u.searchParams.get("uid") || "").replace("eq.", "") !== UID && u.searchParams.get("uid")) {
      return json(r, state.memberStats.filter((x) => x.uid === u.searchParams.get("uid").replace("eq.", "")));
    }
    if (p === "machine_stats") {
      const mid = (u.searchParams.get("machine_id") || "").replace("eq.", "");
      const rows = mid ? state.stats.filter((s) => s.machine_id === mid) : state.stats;
      return single ? (rows[0] ? json(r, rows[0]) : json(r, { code: "PGRST116" }, 406)) : json(r, rows);
    }
    if (p === "attendance") return json(r, req.method() === "GET" ? state.attendance : []);
    if (p === "pump_photos") return json(r, state.photos);
    const eq = (k) => { const v = u.searchParams.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
    const countResp = (n) => r.fulfill({ status: 200, contentType: "application/json", body: "", headers: { "content-range": `*/${n}`, "access-control-expose-headers": "content-range" } });
    if (p === "machine_limits") return state.missingTables?.machine_limits ? json(r, { code: "42P01", message: "missing" }, 404) : json(r, state.limits);
    if (p === "member_notices") return json(r, state.notices.filter((n) => !n.seen_at));
    if (p === "tap_events") return json(r, state.taps);
    if (p === "feedback") {
      if (req.method() === "PATCH") { const id = Number(eq("id")); const patch = JSON.parse(req.postData() || "{}"); state.feedback.forEach((f) => { if (f.id === id) Object.assign(f, patch); }); return json(r, []); }
      const st = eq("status"); const mid = eq("machine_id");
      return json(r, state.feedback.filter((f) => (!st || f.status === st) && (!mid || f.machine_id === mid)));
    }
    if (p === "v_admin_set_logs") {
      const uidF = eq("uid"); const mid = eq("machine_id");
      return json(r, state.adminSets.filter((x) => (!uidF || x.uid === uidF) && (!mid || x.machine_id === mid)));
    }
    if (p === "set_logs" && req.method() === "HEAD") {
      if (eq("review_status") === "flagged") return countResp(state.queue.length);
      return countResp(state.adminSets.length);
    }
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
  // sponsor images on the Rewards page (never hit the real sites in tests)
  await page.route(/^https:\/\/(www\.)?(thecleancratefoods\.com|jerseydrip\.shop)\//, (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: IMG }));
}

module.exports = { defaultState, setup, UID, day, iso };
