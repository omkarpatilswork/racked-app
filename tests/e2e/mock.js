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
  const season = { id: 7, title: "Week of 16 Nov", period: "week", starts_at: hrs(-30), ends_at: hrs(80), prizes, players: 6, leader: { name: "Asha", score: 520 } };
  const settings = { gym_name: "Club 360", gym_location: "Baner, Pune", gym_logo_url: null, gym_logo_dark_url: null, gym_instagram_url: "https://instagram.com/club360", gym_website_url: null, prize_headline: null, rewards_note: "Winners collect at the front desk every Monday", show_partners: true, show_shop: true,
    tv_slides: { join: { times: 2, seconds: 12 }, howto: { times: 2, seconds: 12 }, board: { times: 4, seconds: 10 }, today: { times: 2, seconds: 10 }, prize: { times: 1, seconds: 9 }, challenge: { times: 1, seconds: 9 }, partner: { times: 1, seconds: 8 }, winners: { times: 1, seconds: 8 } } };
  const shop = [
    { id: 11, sponsor_id: "clean-crate", title: "Protein oats, 1 pack", description: "One 60 g pack of The Clean Crate protein oats (15 g protein).", image_url: null, xp_cost: 600, code_mode: "desk", stock_left: 18, per_member_limit: 1, valid_until: null },
    { id: 12, sponsor_id: "jersey-drip", title: "₹150 off at Jersey Drip", description: "A discount on any jersey at jerseydrip.shop.", image_url: null, xp_cost: 1000, code_mode: "pool", stock_left: null, per_member_limit: 1, valid_until: null },
    { id: 13, sponsor_id: "clean-crate", title: "Breakfast Box (8 packs)", description: "The Clean Crate Breakfast Box, both flavours.", image_url: null, xp_cost: 3000, code_mode: "desk", stock_left: 3, per_member_limit: 1, valid_until: null },
    { id: 14, sponsor_id: "jersey-drip", title: "Custom Jersey Drip jersey", description: "A jersey of your choice with your name and number.", image_url: null, xp_cost: 6000, code_mode: "desk", stock_left: 0, per_member_limit: 1, valid_until: null },
  ];
  const challenges = [
    { id: 3, sponsor_id: "clean-crate", title: "Clean Crate Leg Press Challenge", description: "Every Friday: the heaviest single Leg Press set of the day wins a goodie bag from The Clean Crate.", metric: "best_lift", machine_id: "leg-press-08", mode: null, starts_at: hrs(-2), ends_at: hrs(10), prize: "A goodie bag from The Clean Crate", winners: 1, join_xp: 20, players: 4, leader: { name: "Rahul", value: 140, reps: 10 }, series_id: 1, repeats: "weekly", weekday: 5, last_result: { ends_at: hrs(-158), name: "Asha", value: 130, reps: 8 } },
  ];
  const overview = { period: "week", settings, season, sponsors, shop, challenges, missions, badges, streak_steps: [{ days: 3, xp: 30 }, { days: 7, xp: 75 }, { days: 14, xp: 150 }, { days: 30, xp: 400 }],
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
    sponsors: sponsors.map((sp, i) => ({ ...sp, active: true, sort: i + 1, show_on_tv: i === 0, tv_headline: null, products: sp.products.map((p, j) => ({ ...p, active: true, sort: j + 1, sponsor_id: sp.id })), clicks_7d: 14 + i, clicks_30d: 52 + i, redeemed_30d: 3 })),
    tv_scans_30d: { "jersey-drip": 9 },
    redemptions: [
      { id: 41, title: "Partner coupons", code: "RK-7F3A2C", source: "prize", status: "issued", rank: 3, xp_spent: 0, created_at: iso(60 * 24), fulfilled_at: null, member: "Omi Patil", sponsor_id: "jersey-drip" },
      { id: 42, title: "Protein oats, 1 pack", code: "RK-91BC0D", source: "shop", status: "issued", rank: null, xp_spent: 600, created_at: iso(300), fulfilled_at: null, member: "Asha Rao", sponsor_id: "clean-crate" },
    ],
  };
  admin.settings = settings;
  admin.series = [{ id: 1, sponsor_id: "clean-crate", title: "Clean Crate Leg Press Challenge", description: challenges[0].description, metric: "best_lift", machine_id: "leg-press-08", mode: null, prize: challenges[0].prize, reward_id: null, winners: 1, join_xp: 20, active: true, weekday: 5, start_time: "00:00", end_time: "24:00", next: { id: 3, starts_at: hrs(-2), ends_at: hrs(10), players: 4 } }];
  admin.challenges = [
    { ...admin.challenges[0], series_id: 1 },
    { id: 2, sponsor_id: "clean-crate", title: "Clean Crate Leg Press Challenge", description: "", metric: "best_lift", machine_id: "leg-press-08", mode: null, starts_at: hrs(-170), ends_at: hrs(-158), prize: "A goodie bag from The Clean Crate", winners: 1, join_xp: 20, players: 5, active: true, awarded_at: null, reward_id: null, series_id: 1, top: [{ rank: 1, name: "Asha Rao", value: 130, reps: 8 }, { rank: 2, name: "Rahul Mehta", value: 120, reps: 10 }] },
  ];
  return { overview, my, board, challengeBoard, admin, settings, syncAwards: [] };
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
    // 0014: member posts, gym notices / offers, milestones, comments
    wallPosts: [
      { id: 301, kind: "text", body: "Anyone up for legs at 7 tomorrow? Need a spotter for squats.", machine_id: "squat-07", mode: "", weeks_apart: null, created_at: iso(8), edited: false, is_mine: false, hidden: false, display_name: "Rahul Mehta", avatar_url: null, instagram_handle: null, media: [], kudos_count: 2, kudos_mine: false, kudos_names: ["Asha", "Neha"] },
      { id: 302, kind: "photo", body: "Back day done. New gloves from Jersey Drip.", machine_id: "lat-pulldown-01", mode: "", weeks_apart: null, created_at: iso(25), edited: false, is_mine: false, hidden: false, display_name: "Neha Kulkarni", avatar_url: null, instagram_handle: "neha.lifts", media: [{ path: "u4/p1.jpg", label: null }, { path: "u4/p2.jpg", label: null }], kudos_count: 5, kudos_mine: false, kudos_names: ["Rahul", "Asha"] },
      { id: 303, kind: "transformation", body: "12 weeks of showing up.", machine_id: null, mode: "", weeks_apart: 12, created_at: iso(140), edited: false, is_mine: false, hidden: false, display_name: "Asha Rao", avatar_url: null, instagram_handle: "asha.lifts", media: [{ path: "u1/before.jpg", label: "before" }, { path: "u1/after.jpg", label: "after" }], kudos_count: 11, kudos_mine: true, kudos_names: ["Rahul", "Neha"] },
      { id: 304, kind: "text", body: "First week on Racked. Hooked.", machine_id: null, mode: "", weeks_apart: null, created_at: iso(400), edited: false, is_mine: true, hidden: false, display_name: "Omi Patil", avatar_url: null, instagram_handle: "omi.lifts", media: [], kudos_count: 0, kudos_mine: false, kudos_names: [] },
    ],
    gymPosts: [
      { id: 41, kind: "notice", title: "Closed Sunday for Diwali", body: "Open again Monday from 6 am. Happy Diwali!", image_url: null, code: null, cta_label: null, cta_url: null, reward_id: null, pinned: true, starts_at: iso(600), ends_at: new Date(now + 3 * 86400000).toISOString(), sponsor: null, reward: null, active: true },
      { id: 42, kind: "offer", title: "15% off any jersey", body: "For Club 360 members this week. Your name and number printed free.", image_url: null, code: "RACKED15", cta_label: "Shop jerseys", cta_url: "https://jerseydrip.shop", reward_id: 12, pinned: false, starts_at: iso(60), ends_at: null, sponsor: { id: "jersey-drip", name: "Jersey Drip", logo_url: null, website_url: "https://jerseydrip.shop" }, reward: { id: 12, title: "₹150 off at Jersey Drip", xp_cost: 1000 }, active: true },
    ],
    milestones: [
      { id: 901, kind: "streak", title: "14-day lifting streak", is_mine: false, name: "Rahul", avatar_url: null, days: 14, at: iso(50) },
      { id: 902, kind: "badge", title: "Explorer", is_mine: false, name: "Neha", avatar_url: null, days: null, at: iso(300) },
    ],
    comments: { "wall:302": [{ id: 71, body: "Those gloves are clean", created_at: iso(20), is_mine: false, hidden: false, display_name: "Rahul Mehta", avatar_url: null }] },
    feedReports: { posts: [], comments: [] },
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
      // short boards are filled with best-ever lifts (0013)
      { machine_id: "chest-press-02", mode: "", rank: 2, name: "Vikram", pb_weight: 80, pb_reps: 8, sets: 6, best_ever: true },
      { machine_id: "chest-press-02", mode: "", rank: 3, name: "Asha", pb_weight: 50, pb_reps: 10, sets: 12, best_ever: true },
    ],
    houseLifts: [
      { id: 1, machine_id: "chest-press-02", mode: "", name: "Vikram", weight: 80, reps: 8, lifted_on: day(-20), created_at: iso(60 * 24 * 20), added_by: "Omi Patil" },
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
      // 0015 (body weight, ×BW boards): only when a test turns it on with enableStrength()
      const STRENGTH_RPCS = ["my_body", "set_my_body", "strength_board", "strength_boards", "season_division_board", "challenge_division_board", "admin_member_body", "admin_set_member_body", "ranks_board"];
      if (!state.strength && STRENGTH_RPCS.includes(name)) return json(r, { code: "PGRST202", message: "Could not find the function" }, 404);
      switch (name) {
        case "my_body": return state.signedIn ? json(r, state.body) : json(r, { code: "42501", message: "Sign in first" }, 401);
        case "set_my_body": {
          if (state.bodyRefuse) return json(r, state.bodyRefuse, 400);
          if (state.body.body_kg == null && (body.p_division == null || body.p_body_kg == null)) return json(r, { code: "RK303", message: "Add your body weight and pick a board" }, 400);
          if (body.p_division) Object.assign(state.body, { division: body.p_division, division_set_at: new Date().toISOString() });
          if (body.p_body_kg != null) Object.assign(state.body, { body_kg: body.p_body_kg, body_set_at: new Date().toISOString(), checked_at: null });
          return json(r, state.body);
        }
        case "strength_board": {
          const d = body.p_division || "all";
          let rows = state.bwBoard.filter((x) => x.machine_id === body.p_machine_id && (x.mode || "") === (body.p_mode || ""));
          if (d !== "all") rows = rows.filter((x) => x.division === d);
          else rows = rows.slice().sort((a, b) => b.ratio - a.ratio).map((x, i) => ({ ...x, rank: i + 1 }));
          return json(r, rows.map((x) => ({ ...x, weight: x.is_me ? x.weight : null })));
        }
        case "strength_boards": return json(r, state.bwBoards.filter((x) => x.rank <= (body.p_limit || 5)));
        case "ranks_board": {
          // 0016: one board, ranked by score | moved | heaviest
          if (!state.signedIn) return json(r, { code: "42501", message: "permission denied" }, 401);
          return json(r, rankRows(state, body));
        }
        case "season_division_board": return json(r, (state.race[body.p_division] || state.race.all).slice(0, body.p_limit || 10).map((x) => ({ ...x, is_me: state.signedIn && x.is_me })));
        case "challenge_division_board": return json(r, (state.chalRace[body.p_division] || state.chalRace.all).map((x) => ({ ...x, is_me: state.signedIn && x.is_me })));
        case "admin_member_body": return state.profile.is_staff ? json(r, state.memberBody || { division: null, body_kg: null }) : staffOnly();
        case "admin_set_member_body": {
          if (!state.profile.is_staff) return staffOnly();
          state.memberBody = { ...(state.memberBody || {}), division: body.p_division || (state.memberBody || {}).division || "open", body_kg: body.p_body_kg, checked_at: new Date().toISOString(), checked_by: "Staff Sam" };
          (state.rewards.admin.to_award || []).forEach((t) => ["men", "women"].forEach((d) => ((t.boards || {})[d] || []).forEach((b) => { if (b.uid === body.p_uid) Object.assign(b, { body_kg: body.p_body_kg, checked_at: new Date().toISOString() }); })));
          return json(r, state.memberBody);
        }
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
        case "track_sponsor_click": { const sp = state.rewards.overview.sponsors.find((x) => x.id === body.p_sponsor_id); return json(r, sp ? sp.website_url : null); }
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
        case "admin_rr_data": return state.profile.is_staff ? json(r, state.rewards.admin) : staffOnly();
        case "admin_save_series": { const p = body.p; if (p.id) { const x = state.rewards.admin.series.find((y) => String(y.id) === String(p.id)); Object.assign(x, { ...p, id: x.id, weekday: Number(p.weekday ?? x.weekday) }); return json(r, x.id); } const id = 10 + state.rewards.admin.series.length; state.rewards.admin.series.push({ ...p, id, weekday: Number(p.weekday), next: null }); return json(r, id); }
        case "admin_save_rr_settings": Object.assign(state.rewards.settings, body.p); return json(r, null);
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
        case "home_feed": {
          const f = body.p_filter || "all";
          const before = body.p_before ? new Date(body.p_before).getTime() : Infinity;
          const lim = body.p_limit || 15;
          const info = (k) => { const l = (state.comments[k] || []).filter((c) => !c.hidden); const last = l[l.length - 1]; return { comment_count: l.length, last_comment: last ? { name: last.display_name.split(" ")[0], body: last.body, is_mine: !!last.is_mine } : null }; };
          const items = [
            ...(f === "all" || f === "prs" ? state.posts.filter((p) => f === "all" || p.has_pb).map((p) => ({ type: "set", id: p.post_id, at: p.created_at, ...p, ...info(`set:${p.post_id}`) })) : []),
            ...(f === "all" || f === "photos" ? state.feedPhotos.map((p) => ({ type: "pump", id: p.item_id, at: p.created_at, ...p, ...info(`photo:${p.item_id}`) })) : []),
            ...state.wallPosts.filter((w) => (!w.hidden || w.is_mine) && (f === "all" || (f === "photos" && w.kind === "photo") || (f === "transformations" && w.kind === "transformation") || (f === "posts" && w.kind === "text"))).map((w) => ({ type: "wall", at: w.created_at, ...w, ...info(`wall:${w.id}`) })),
            ...(f === "all" || f === "gym" ? state.gymPosts.filter((g) => g.active && !g.pinned).map((g) => ({ type: "gym", at: g.starts_at, ...g })) : []),
            ...(f === "all" ? state.milestones.map((m) => ({ type: "milestone", ...m })) : []),
          ].filter((i) => new Date(i.at).getTime() < before).sort((a, b) => new Date(b.at) - new Date(a.at));
          const page = items.slice(0, lim);
          return json(r, { items: page, pinned: !body.p_before && (f === "all" || f === "gym") ? state.gymPosts.filter((g) => g.active && g.pinned) : [], has_more: items.length > lim });
        }
        case "create_wall_post": {
          if (/(https?:\/\/|www\.|\.com\b)/i.test(body.p_body || "")) return json(r, { code: "RK201", message: "Links can't be posted. Write it out instead." }, 400);
          const id = 400 + state.wallPosts.length;
          state.wallPosts.unshift({ id, kind: body.p_kind, body: body.p_body, machine_id: body.p_machine_id, mode: body.p_mode || "", weeks_apart: body.p_weeks, created_at: new Date().toISOString(), edited: false, is_mine: true, hidden: false, display_name: state.profile.display_name, avatar_url: null, instagram_handle: state.profile.instagram_handle, media: (body.p_media || []).map((m) => ({ path: m.path, label: m.label })), kudos_count: 0, kudos_mine: false, kudos_names: [] });
          return json(r, id);
        }
        case "edit_wall_post": { const w = state.wallPosts.find((x) => x.id === body.p_id); if (w) Object.assign(w, { body: body.p_body, machine_id: body.p_machine_id, mode: body.p_mode || "", edited: true }); return json(r, null); }
        case "delete_wall_post": { const w = state.wallPosts.find((x) => x.id === body.p_id); state.wallPosts = state.wallPosts.filter((x) => x.id !== body.p_id); return json(r, w ? w.media.map((m) => m.path) : []); }
        case "toggle_wall_kudos": { const w = state.wallPosts.find((x) => x.id === body.p_id); w.kudos_mine = !w.kudos_mine; w.kudos_count += w.kudos_mine ? 1 : -1; return json(r, { count: w.kudos_count, mine: w.kudos_mine }); }
        case "report_wall_post": return json(r, null);
        case "list_comments": return json(r, state.comments[`${body.p_type}:${body.p_id}`] || []);
        case "add_comment": {
          if (/(https?:\/\/|www\.|\.com\b)/i.test(body.p_body || "")) return json(r, { code: "RK201", message: "Links can't be posted. Write it out instead." }, 400);
          const k = `${body.p_type}:${body.p_id}`;
          const c = { id: 800 + Object.values(state.comments).flat().length, body: body.p_body, created_at: new Date().toISOString(), is_mine: true, hidden: false, display_name: state.profile.display_name, avatar_url: null };
          state.comments[k] = [...(state.comments[k] || []), c];
          return json(r, c);
        }
        case "delete_comment": Object.keys(state.comments).forEach((k) => (state.comments[k] = state.comments[k].filter((c) => c.id !== body.p_id))); return json(r, null);
        case "report_comment": return json(r, null);
        case "admin_gym_posts": return state.profile.is_staff ? json(r, state.gymPosts.map((g) => ({ ...g, sponsor_id: g.sponsor ? g.sponsor.id : null, updated_at: g.starts_at, status: !g.active ? "off" : new Date(g.starts_at) > new Date() ? "scheduled" : g.ends_at && new Date(g.ends_at) < new Date() ? "ended" : "live" }))) : staffOnly();
        case "admin_save_gym_post": {
          const p = body.p;
          if (p.cta_url && !/^https?:\/\//.test(p.cta_url)) return json(r, { code: "22023", message: "The button link must start with https://" }, 400);
          if (p.id) { const g = state.gymPosts.find((x) => String(x.id) === String(p.id)); Object.assign(g, { ...p, id: g.id, pinned: p.pinned ?? g.pinned, active: p.active ?? g.active }); return json(r, g.id); }
          const id = 50 + state.gymPosts.length;
          state.gymPosts.push({ ...p, id, pinned: !!p.pinned, active: p.active ?? true, starts_at: p.starts_at || new Date().toISOString(), sponsor: p.sponsor_id ? { id: p.sponsor_id, name: p.sponsor_id === "jersey-drip" ? "Jersey Drip" : "The Clean Crate", logo_url: null, website_url: null } : null, reward: null });
          return json(r, id);
        }
        case "admin_delete_gym_post": state.gymPosts = state.gymPosts.filter((g) => g.id !== body.p_id); return json(r, null);
        case "admin_feed_reports": return state.profile.is_staff ? json(r, state.feedReports) : staffOnly();
        case "admin_set_post_hidden": state.feedReports.posts = state.feedReports.posts.filter((x) => x.id !== body.p_id); return json(r, null);
        case "admin_set_comment_hidden": state.feedReports.comments = state.feedReports.comments.filter((x) => x.id !== body.p_id); return json(r, null);
        case "tv_boards": return json(r, state.tvBoards.filter((x) => !x.best_ever).map(({ best_ever, ...x }) => x));
        case "machine_boards": return json(r, state.tvBoards.filter((x) => (body.p_fill > 0 || !x.best_ever) && x.rank <= (body.p_limit || 5)).map((x) => ({ best_ever: false, ...x })));
        case "machine_board": {
          const rows = state.machineBoard.filter((x) => x.machine_id === body.p_machine_id).map((x) => ({ best_ever: false, house: false, ...x }));
          const house = state.houseLifts.filter((h) => h.machine_id === body.p_machine_id && h.mode === (body.p_mode || "")).map((h) => ({ machine_id: h.machine_id, mode: h.mode, uid: null, display_name: h.name, avatar_url: null, pb_weight: h.weight, pb_reps: h.reps, xp: 0, level: 1, sets: 1, house: true, best_ever: false }));
          let all = [...rows, ...house].sort((a, b) => b.pb_weight - a.pb_weight || b.pb_reps - a.pb_reps).map((x, i) => ({ ...x, rank: i + 1 }));
          if (state.thinPeriods && body.p_period !== "all" && state.thinPeriods.includes(body.p_period)) {
            // only the first lifter counts this period; the rest fill in as best-ever lifts
            all = all.map((x, i) => (i === 0 ? x : { ...x, best_ever: true })).slice(0, Math.max(1, body.p_fill || 0));
          }
          return json(r, all);
        }
        case "tv_feed": {
          const ov = state.rewards.overview;
          return json(r, { ...ov, tv_slides: state.rewards.settings.tv_slides || null,
            ...(state.strength ? { season_tops: { men: state.race.men.slice(0, 5), women: state.race.women.slice(0, 5) } } : {}),
            tv_partners: ov.sponsors.filter((x) => x.show_on_tv !== false).map((x) => ({ id: x.id, tv_headline: x.tv_headline || null })),
            season_top: ov.season ? state.rewards.board.slice(0, 5).map(({ is_me, ...x }) => x) : [] });
        }
        case "admin_house_lifts": return state.profile.is_staff ? json(r, state.houseLifts) : staffOnly();
        case "admin_save_house_lift": {
          const p = body.p;
          const lim = state.limits.find((x) => x.machine_id === p.machine_id);
          if (lim && Number(p.weight) > lim.max_weight) return json(r, { code: "22023", message: `That's more than this machine goes up to (${lim.max_weight} kg max)` }, 400);
          if (p.id) { const x = state.houseLifts.find((h) => h.id === p.id); Object.assign(x, p); return json(r, x.id); }
          const id = 100 + state.houseLifts.length;
          state.houseLifts.push({ ...p, id, weight: Number(p.weight), reps: Number(p.reps), created_at: new Date().toISOString(), added_by: state.profile.display_name });
          return json(r, id);
        }
        case "admin_delete_house_lift": state.houseLifts = state.houseLifts.filter((h) => h.id !== body.p_id); return json(r, null);
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
    if (p === "rr_settings") return state.missingTables?.rr_settings ? json(r, { code: "42P01", message: "missing" }, 404) : json(r, single ? { id: 1, ...state.rewards.settings } : [{ id: 1, ...state.rewards.settings }]);
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
    if (u.includes("/object/public/rr-media/")) return r.fulfill({ status: 200, contentType: "image/jpeg", body: IMG });
    if (u.includes("/object/pump-photos/") && r.request().method() === "POST") { state.calls.push("storage:upload pump-photos/" + u.split("/object/pump-photos/")[1]); return json(r, { Key: "pump-photos/x", Id: "x" }); }
    if (u.includes("/object/rr-media/") && r.request().method() === "POST") { state.calls.push("storage:upload " + u.split("/object/rr-media/")[1]); return json(r, { Key: "rr-media/x", Id: "x" }); }
    if (u.includes("/object/list/")) { state.calls.push("storage:list"); return json(r, state.storageFiles || []); }
    if (r.request().method() === "DELETE") { state.calls.push("storage:delete " + (r.request().postData() || "")); state.storageFiles = []; return json(r, []); }
    return json(r, { Key: "x" });
  });
  await page.route("**/realtime/v1/**", (r) => r.abort());
  // sponsor images on the Rewards page (never hit the real sites in tests)
  await page.route(/^https:\/\/(www\.)?(thecleancratefoods\.com|jerseydrip\.shop)\//, (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: IMG }));
}

// Database update 0015: body weight, Men's / Women's boards ranked by ×BW,
// strength points for the weekly prize. body: null = not added yet.
// Ranks v2 (0016) sample people. week/all: score, kg moved, heaviest [kg, reps, machine].
// lat: on Lat Pulldown [score, reps], heaviest [kg, reps], kg moved.
const RANK_PEOPLE = [
  { name: "Rahul", div: "men", week: { score: 283, moved: 6240, heavy: [140, 10, "leg-press-08"] }, all: { score: 410, moved: 48200, heavy: [160, 8, "leg-press-08"] }, lat: { score: [83, 12], heavy: [65, 12], moved: 2340 } },
  { name: "Omi", div: "men", me: true, week: { score: 255, moved: 4200, heavy: [120, 12, "leg-press-08"] }, all: { score: 380, moved: 43600, heavy: [130, 10, "leg-press-08"] }, lat: { score: [69, 10], heavy: [55, 10], moved: 1650 } },
  { name: "Kabir", div: "men", week: { score: 240, moved: 5100, heavy: [110, 8, "leg-press-08"] }, all: { score: 300, moved: 22000, heavy: [120, 8, "leg-press-08"] }, lat: { score: [60, 10], heavy: [48, 10], moved: 1440 } },
  { name: "Dev", div: "men", week: { score: 120, moved: 2300, heavy: [80, 8, "chest-press-02"] }, all: { score: 150, moved: 9000, heavy: [90, 6, "chest-press-02"] }, lat: { score: [50, 12], heavy: [40, 12], moved: 960 } },
  { name: "Asha", div: "women", week: { score: 231, moved: 3900, heavy: [100, 8, "leg-press-08"] }, all: { score: 350, moved: 52000, heavy: [120, 8, "leg-press-08"] }, lat: { score: [100, 8], heavy: [60, 8], moved: 1900 } },
  { name: "Neha", div: "women", week: { score: 190, moved: 2800, heavy: [60, 10, "leg-press-08"] }, all: { score: 260, moved: 15000, heavy: [70, 10, "leg-press-08"] }, lat: { score: [65, 10], heavy: [39, 10], moved: 1050 } },
  { name: "Sam", div: null, week: { score: null, moved: 1500, heavy: [50, 10, "rowing-03"] }, all: { score: null, moved: 7200, heavy: [55, 10, "rowing-03"] }, lat: null },
];
function rankRows(state, b) {
  const metric = ["score", "moved", "heaviest"].includes(b.p_metric) ? b.p_metric : "score";
  const period = b.p_period === "all" ? "all" : "week";
  const div = ["men", "women"].includes(b.p_division) ? b.p_division : "all";
  const machine = b.p_machine_id || null;
  const meHasBody = state.body && state.body.body_kg != null;
  const meDiv = meHasBody ? state.body.division : null;
  let rows = RANK_PEOPLE.map((p) => ({ ...p, div: p.me ? meDiv : p.div }))
    .filter((p) => div === "all" || p.div === div)
    .map((p) => {
      if (machine) {
        if (machine !== "lat-pulldown-01" || !p.lat) return null;
        if (metric === "score") return p.lat.score && (p.div || !p.me) && (!p.me || meHasBody) ? { value: p.lat.score[0], reps: p.lat.score[1], machine_id: machine, p } : null;
        if (metric === "heaviest") return { value: p.lat.heavy[0], reps: p.lat.heavy[1], machine_id: machine, p };
        return { value: p.lat.moved, reps: null, machine_id: null, sets: 4, p };
      }
      const d = p[period];
      if (metric === "score") return d.score != null && (!p.me || meHasBody) ? { value: d.score, reps: null, machine_id: null, p } : null;
      if (metric === "heaviest") return { value: d.heavy[0], reps: d.heavy[1], machine_id: d.heavy[2], p };
      return { value: d.moved, reps: null, machine_id: null, sets: Math.round(d.moved / 450), p };
    })
    .filter(Boolean)
    .sort((x, y) => y.value - x.value || (y.reps || 0) - (x.reps || 0));
  if (machine && metric !== "moved" && state.rankHouse) rows.push({ value: state.rankHouse.value, reps: state.rankHouse.reps, machine_id: machine, house: true, p: { name: state.rankHouse.name } });
  rows.sort((x, y) => y.value - x.value || (y.reps || 0) - (x.reps || 0));
  const lim = b.p_limit || 50;
  return rows
    .map((x, i) => ({ rank: i + 1, name: x.p.name === "Omi" ? "Omi" : x.p.name, avatar_url: null, value: x.value, reps: x.reps, machine_id: x.machine_id, mode: x.machine_id ? "" : null, sets: x.sets ?? 3, is_me: !!x.p.me && state.signedIn, house: !!x.house }))
    .filter((x) => x.rank <= lim || x.is_me);
}

function enableStrength(st, opts = {}) {
  st.strength = true;
  st.body = opts.body === null
    ? { division: null, body_kg: null }
    : { division: "men", body_kg: 80, body_set_at: iso(60 * 24 * 10), division_set_at: iso(60 * 24 * 10), checked_at: null, next_body_change: null, next_division_change: null, ...(opts.body || {}) };
  const R = st.rewards;
  const ov = R.overview;
  ov.scoring = "strength";
  ov.season.leaders = { men: { name: "Rahul", score: 283 }, women: { name: "Asha", score: 231 } };
  ov.season.players_by = { men: 4, women: 2 };
  ov.challenges.forEach((c) => (c.leaders = { men: { name: "Rahul", value: 1.75, reps: 10 }, women: { name: "Asha", value: 1.5, reps: 8 } }));
  ov.last_winners = { season: "Week of 9 Nov", scoring: "strength", winners: [
    { rank: 1, name: "Rahul", score: 410, prize: ov.season.prizes[0].title, division: "men" }, { rank: 2, name: "Omi", score: 380, prize: "Partner coupons", division: "men" },
    { rank: 1, name: "Asha", score: 350, prize: ov.season.prizes[0].title, division: "women" }, { rank: 2, name: "Neha", score: 300, prize: "Partner coupons", division: "women" } ] };
  const hasBody = st.body.body_kg != null;
  R.my.season = { ...R.my.season, division: hasBody ? st.body.division === "open" ? null : st.body.division : null, scoring: "strength",
    rank: hasBody ? 2 : null, score: hasBody ? 255 : 0, players: 4, ahead: hasBody ? { name: "Rahul", score: 283 } : null };
  R.my.body = { division: st.body.division, body_kg: st.body.body_kg };
  R.my.challenges = hasBody ? [{ id: 3, rank: 2, value: 1.5, reps: 12, division: "men" }] : [];
  st.race = {
    men: [{ rank: 1, name: "Rahul", score: 283, is_me: false }, { rank: 2, name: "Omi", score: 255, is_me: hasBody }, { rank: 3, name: "Kabir", score: 240, is_me: false }, { rank: 4, name: "Dev", score: 120, is_me: false }],
    women: [{ rank: 1, name: "Asha", score: 231, is_me: false }, { rank: 2, name: "Neha", score: 190, is_me: false }],
  };
  st.race.all = [...st.race.men, ...st.race.women].sort((a, b) => b.score - a.score).map((x, i) => ({ ...x, rank: i + 1 }));
  st.chalRace = {
    men: [{ rank: 1, name: "Rahul", value: 1.75, reps: 10, is_me: false }, { rank: 2, name: "Omi", value: 1.5, reps: 12, is_me: hasBody }],
    women: [{ rank: 1, name: "Asha", value: 1.5, reps: 8, is_me: false }],
  };
  st.chalRace.all = [...st.chalRace.men, ...st.chalRace.women].sort((a, b) => b.value - a.value).map((x, i) => ({ ...x, rank: i + 1 }));
  const row = (machine_id, mode, division, rank, name, ratio, reps, extra = {}) => ({ machine_id, mode, division, rank, name, reps, ratio, sets: 4, best_ever: false, ...extra });
  st.bwBoards = [
    row("lat-pulldown-01", "", "men", 1, "Rahul", 0.83, 12), row("lat-pulldown-01", "", "men", 2, "Omi", 0.69, 10), row("lat-pulldown-01", "", "men", 3, "Kabir", 0.6, 10),
    row("lat-pulldown-01", "", "women", 1, "Asha", 1.0, 8), row("lat-pulldown-01", "", "women", 2, "Neha", 0.65, 10), row("lat-pulldown-01", "", "women", 3, "Meera", 0.9, 10, { best_ever: true }),
    row("leg-press-08", "", "men", 1, "Rahul", 1.75, 10), row("leg-press-08", "", "women", 1, "Asha", 1.5, 8),
    row("chest-press-02", "", "men", 1, "Dev", 0.75, 8),
  ];
  const mrow = (division, rank, uid, display_name, ratio, reps, extra = {}) => ({ machine_id: "lat-pulldown-01", mode: "", division, uid, display_name, avatar_url: null, weight: null, reps, ratio, xp: 300, level: 3, sets: 20, rank, best_ever: false, house: false, is_me: false, ...extra });
  st.bwBoard = [
    mrow("men", 1, "u2", "Rahul Mehta", 0.83, 12), mrow("men", 2, UID, "Omi Patil", 0.69, 10, { weight: 55, is_me: hasBody }), mrow("men", 3, "u5", "Kabir S", 0.6, 10), mrow("men", 4, "u6", "Dev", 0.5, 12),
    mrow("women", 1, "u1", "Asha Rao", 1.0, 8), mrow("women", 2, "u4", "Neha Kulkarni", 0.65, 10),
  ];
  if (!hasBody) st.bwBoard = st.bwBoard.filter((x) => x.uid !== UID);
  const A = R.admin;
  A.scoring = "strength";
  A.live_boards = {
    men: [{ rank: 1, name: "Rahul Mehta", score: 283, flagged: 0 }, { rank: 2, name: "Omi Patil", score: 255, flagged: 0 }, { rank: 3, name: "Aarav Shah", score: 240, flagged: 0, demo: true }],
    women: [{ rank: 1, name: "Asha Rao", score: 231, flagged: 0 }, { rank: 2, name: "Neha Kulkarni", score: 190, flagged: 1 }],
  };
  A.to_award.forEach((t) => (t.boards = {
    men: [{ rank: 1, uid: "u2", name: "Rahul Mehta", score: 410, flagged: 0, body_kg: 78, checked_at: null, prize: ov.season.prizes[0].title },
          { rank: 2, uid: UID, name: "Omi Patil", score: 380, flagged: 0, body_kg: 80, checked_at: iso(60 * 5), prize: "Partner coupons" }],
    women: [{ rank: 1, uid: "u1", name: "Asha Rao", score: 350, flagged: 0, body_kg: 58, checked_at: null, prize: ov.season.prizes[0].title }],
  }));
  A.challenges.forEach((c) => (c.tops = { men: [{ rank: 1, name: "Rahul Mehta", value: 1.75, reps: 10 }], women: [{ rank: 1, name: "Asha Rao", value: 1.5, reps: 8 }] }));
  st.memberBody = { division: "men", body_kg: 78, checked_at: null };
  return st;
}

module.exports = { defaultState, setup, UID, day, iso, enableStrength };
