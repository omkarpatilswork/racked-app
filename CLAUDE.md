# Racked by Bijlee — Claude Code handoff

> Claude Code reads this file automatically at the start of every session.
> Last updated 2026-11-10 after the public landing page + Bijlee brand update (no migration), on top of the TV slideshow, the staff console + fair play (0010) and the 2026 refresh (0009). Where it says "unconfirmed", check before assuming.

## 0. First thing to do each session

1. `git pull` on `main` first. Omi also pushes from GitHub Desktop, so local can be behind.
2. Read this file, then `README.md`. Setup steps for a fresh install are in `docs/SETUP.md`.
3. Check `git status`. Delete any stray `START-HERE*.txt` at the repo root. They come from unzipping delivery bundles (older ones live in `docs/updates/`).
4. Work with Omi in plain language. He is a product manager, not an engineer, and uses **Windows**. Explain outcomes simply and spell out any manual step click by click.

## 1. What this is

**Racked by Bijlee** is a gym companion web app for the Bijlee community in Pune. A member taps an NFC sticker, or scans a QR code, on a gym machine. That opens `/machine/<id>?tap=<code>`. They see their personal best (PB), log a set, earn XP, keep an attendance streak, and compete on leaderboards. There is also a social feed with kudos, optional pre/post "pump" photos, and a public gym TV screen.

- Owner: Omi (Omkar Patil). It sits in his Claude Project "EZ Bill".
- Live app: https://racked-app-liard.vercel.app
- Repo: https://github.com/omkarpatilswork/racked-app (branch `main`)
- Local folder on Omi's PC: `D:\Racked\racked-app`
- Deploy: push to `main` and Vercel auto-deploys in about a minute. There is no CI. Real members use it, so keep `main` stable.

## 2. Stack

- Next.js 14.2 App Router, TypeScript, React 18. Pages are mostly **client components**. The root layout has `dynamic = "force-dynamic"`.
- Supabase: Postgres + RLS, Auth (Google OAuth only), Realtime, Storage (private bucket `pump-photos`).
- Styling: one design system in `app/globals.css`, using CSS variables and component classes. Tailwind is present but barely used.
- Fonts are self-hosted from npm, with no Google Fonts requests: **Unbounded** (display), **Manrope** (body) and **JetBrains Mono** (numbers/labels). Unbounded is loaded through `next/font/local` in `app/layout.tsx` (from `node_modules/@fontsource-variable/unbounded/files/…latin-wght…woff2`) so it's preloaded with a size-matched fallback; it sets `--font-unbounded`, which `--font-display` uses. Manrope and JetBrains Mono are plain fontsource imports. Always use the `--font-display`, `--font-sans` and `--font-mono` variables (the canvas share card reads `--font-display` too). **Omi prefers Unbounded: don't swap the display font** (a trial of Archivo was rejected).
- Motion library: `gsap` 3.13 (with ScrollTrigger), used **only** on the landing page and loaded lazily there.
- Hosting: Vercel. "Today" in SQL means **Asia/Kolkata**, via `app_timezone()`.
- Scripts: `npm run dev`, `build`, `lint`, `seed`.

### Environment variables (names only — never commit values)

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in Vercel, and in `.env.local` for local runs.
- `SUPABASE_SERVICE_ROLE_KEY` is local only, for `scripts/seed.ts`. Never use it client-side and never put it on Vercel.
- `NEXT_PUBLIC_SITE_URL` (optional): the real domain once there is one (e.g. `https://racked.run`). Used for link previews, `sitemap.xml` and `robots.txt`; defaults to the vercel.app address. Set it on Vercel and redeploy when the domain goes live.
- `NEXT_PUBLIC_GYM_NAME` (optional): the gym's name as members know it. The landing page's live ticker and FAQ use it; without it they say "the gym" / "our partner gym in Pune".
- `.env*.local` is git-ignored. If you create a placeholder `.env.local` for tests, delete it afterwards.

## 3. Design system (2026 refresh)

- **Dark-first.** `<html data-theme="dark|light">` is set before first paint by `THEME_BOOT_SCRIPT` (`lib/theme.ts`, inlined in `app/layout.tsx`), so there's no flash. The member picks Dark, Light or Auto in Settings; it's stored in `localStorage["racked:theme"]` and the default is dark. `components/AppEffects.tsx` keeps Auto in sync with the phone.
- **Brand = Bijlee Run Club.** Colours come from the club's bolt mark: red-orange `#FF482C` (`--bijlee-red`), bolt yellow `#F4B424` (`--bijlee-yellow`, highlights only), warm ink `#202018` (`--bijlee-ink`), paper `#F5F4EE`. Dark surfaces are warm near-blacks (`--bg #0d0d0a`, `--surface #161612`…). The mark is `components/BoltMark.tsx` (same shapes as `public/brand/bijlee-bolt.svg`); the lockup "bolt + RACKED + × BIJLEE" is `BrandMark` in `components/Topbar.tsx` and is used in the app top bar, staff console, welcome, TV header, landing nav and share card. Wordmark PNGs (red/ink/white) are in `public/brand/`. App icons in `public/icons/` and `public/icon.svg` are the Bijlee bolt.
- **Tokens** are defined in `:root` (dark) and `[data-theme="light"]`. The accent is still named `--yellow` for historical reasons; it's Bijlee red-orange. Use:
  - `--accent-text` for orange text
  - `--accent-soft` for tinted backgrounds
  - `--accent-grad` for primary buttons
  - `--yellow-ink` for text on the accent
  - `--surface`, `--surface-2`, `--surface-3`, `--border` and `--border-strong` for layering
  - `--dark-surface` / `--on-dark`, which never flip with the theme

  Light-mode accent colours were chosen to pass WCAG AA with white text.
- **Key classes:**
  - Layout: `.page` (enter animation), `.card`, `.bento` + `.tile`, `.hero-machine` (always-dark hero), `.dark-card`
  - Controls: `.btn` / `.btn-yellow` / `.btn-ghost` / `.btn-outline` / `.btn-lg` / `.btn-sm`, `.chip` (with `aria-pressed`/`aria-selected`), `.scroll-row` (horizontal chip scroller), `.tabs` + `.tab`
  - Lists and forms: `.list` / `.list-row` (settings rows), `.switch`, `.field` (16px font so iOS doesn't zoom)
  - Indicators: `.ring` (conic progress with `--p`), `.podium`, `.pill` / `.pill-yellow`, `.skeleton`
  - Navigation: `.bottom-nav` (floating glass nav), `.sticky-cta` (primary action pinned at the bottom of focused screens)
  - Brand CTA: `.btn-slab` (slanted red slab with a hard yellow shadow; wrap the label in a `<span>`), used for sign-up buttons on `/join` and the signed-out home. `.g-chip` puts the Google "G" on a white disc inside it.
- **Shared components:** `Sheet` (accessible bottom sheet: role=dialog, Escape, focus trap, scroll lock), `ConfirmSheet` (optional "type DELETE"), `Avatar`, `Topbar` (brand, or a `back` button, plus `title`), `Icon` (inline SVG set, `aria-hidden`; add new icons to `PATHS`).
- **Motion:** respects `prefers-reduced-motion` globally. Haptics go through `lib/haptics.ts` (`haptic("tap"|"success"|"pb"|"alert")`). They work on Android, iOS ignores them, and they can be switched off in Settings.
- **Accessibility bar:** axe-core shows no serious or critical WCAG A/AA issues on the main screens in both themes, and nothing scrolls sideways at 360px. Keep it that way: labels on inputs, `aria-*` on toggles, 44px+ tap targets.

## 4. Routes

- `/` **Public landing page** (`components/landing/Landing.tsx`, styles in `components/landing/landing.css`, loaded only there). Signed-in members never see it: `lib/supabase/middleware.ts` redirects `/` → `/home` when the session is valid, and the page itself also redirects as a fallback. Sections: sticky nav; hero ("Tap. Lift. Get on the board.", CSS-only bolt strike + red wipe reveal, phone mock-up of the machine page); live ticker from `tv_activity` (lifters, sets, kg, PBs; leans with scroll velocity); **How it works** scrollytelling (4 steps; the step on screen = which of 4 invisible markers crosses the viewport's middle, via IntersectionObserver, so it works with reduced motion too; a pinned phone plays coded mini-screens from `components/landing/Screens.tsx`: tap/unlock, log with a finger tapping +, PB burst with confetti + XP count, board reorder); the **real `/tv` running in an iframe** (`components/landing/TvPreview.tsx`, mounted only when near, scaled from 1920×1080); "Under the hood" (paper section); Bijlee Run Club slab (links to bijlee.run and @bijlee.run, "Run a gym in Pune? DM us"); FAQ (`<details>`); final CTA + giant RACKED. One big button (`StartButton`): signed out → Google sign-in with `next=/home`; signed in → `/home`. GSAP + ScrollTrigger are imported dynamically on first scroll/touch (or after 3.5 s) so they never slow the first screen. Photos: add files to `public/landing/` and list them in `LANDING_PHOTOS` (`lib/site.ts`); the strip only shows when the list isn't empty.
- `/about`: the same landing page, but never redirects (members can see/share it). Canonical points to `/`.
- `/home` **The app home** (was `/` until Nov 2026).
  - Signed in: greeting, a "You're at <machine>" resume card (from `getActiveMachineId()` in `lib/machineLock.ts`) or a tap-in hint, bento stats (streak with last-7-days dots, level ring, this week's volume), Today's pump check, and the Gym feed.
  - Signed out: "Tap. Lift. Get on the board." hero with the slab Google button, a "What is Racked?" link to `/about`, "How it works", and Google sign-in.
  - The bottom-nav Home tab, the PWA `start_url`, the auth callback's default and `/welcome`'s default all point to `/home`.
- `/machines`: all machines, with muscle-group filter chips, your PB per machine and a progress bar.
- `/machine/[id]`: hero with your PB and the challenge gap, the **Log a set** CTA, bento stats, the top-3 board, the challenge, and guide/feedback links. **Locked** unless the URL carries the machine's `tapCode`/`qrCode` or this tab tapped it within 4 hours (`lib/machineLock.ts`). The locked view (`LockedMachine`) explains how to tap in and links to the guide and leaderboard.
- `/machine/[id]/log`: the core loop (see §6).
- `/machine/[id]/guide`: **open to everyone** (no tap needed); "Log a set" only shows if the machine is unlocked.
- `/machine/[id]/feedback`: report an issue (locked like the machine page).
- `/leaderboard`: Overall XP or By machine (chip scroller), period chips, a podium for the top 3, and your-rank card. Has loading skeletons and an error state with retry.
- `/profile`: header (avatar, name, @handle, level), level ring, totals, attendance calendar, progress photos and your machines. The gear icon opens `/settings`.
- `/settings`:
  - Profile: display name and Instagram handle, saved together.
  - Appearance: theme.
  - Workout: rest-timer length and vibration.
  - Install-app prompt.
  - Privacy link.
  - Sign out, with a confirm.
  - Delete account, only shown when 0009 has been run, with typed DELETE confirm.
- `/welcome`: 3-step onboarding for new members (what it is, how to tap in, name + optional Instagram). `components/OnboardingGate.tsx` redirects a signed-in member whose `profiles.onboarded_at === null` here, with `?next=` back to where they were. **`undefined` (0009 not run) never redirects.** A failed Skip sets `sessionStorage["racked:welcome-skipped"]` so nobody gets trapped.
- `/privacy`: a plain-language data summary. It's a summary, not a legal policy.
- `/admin`: the **staff console** (staff only, `profiles.is_staff`). Its tabs live in `components/admin/*` and are chosen with `?tab=`:
  - **Overview**: KPIs, check-in methods, busiest machines, machine health.
  - **Review**: the flagged-set queue (Approve / Remove with a reason), plus all recent sets with remove.
  - **Members**: search, then a member's machines (reset that member on one machine) and their sets.
  - **Machines**: per-machine limits (max kg, max reps, jump %), reset a machine for everyone (type RESET), and a danger zone to reset all data.
  - **Feedback**: open/fixed/dismissed, CSV export.
  - **Activity**: audit log of staff actions.

  Removals and resets ask for a reason (`components/admin/ReasonSheet.tsx`, presets in `lib/fairplay.ts`), which the member sees as a note on Home (`components/StaffNotices.tsx`).
- `/admin/photos`: reported-photo moderation (staff only).
- `/tv`: the **gym TV slideshow** (public, first names only, landscape TV). Built to pull non-members in, not just show ranks:
  - Slides (`lib/tvSlides.ts` `buildSlides()`): **Join** (big QR to `/join?src=tv`, "Tap. Lift. Get on the board.", 3 steps, live proof chip) → **Gym today** (kg moved, counted up, with a fun equivalent from `lib/tvCopy.ts`; lifters, sets, new PBs, busiest machine) → leaderboards in threes (podium, "Think you can beat X?" card, empty spots say "Open / Be next"), with **Who's hitting what** (muscle-group bars + "up for grabs") and the Join slide coming back in between. Empty gym → just Join + **Every board is wide open**.
  - Every non-join slide has a corner QR ("Not on the board yet?"). QR = `components/tv/QrCode.tsx` (npm `qrcode`, SVG). Count-up = `components/tv/CountUp.tsx`.
  - Data: anon RPCs `tv_boards` + `tv_activity` via `fetchTvData()`, polled every 10s; header flips to "Reconnecting" after 35s without a good refresh, last slides stay up. Slide timing: join 12s, totals 10s, boards `?interval=` (default 8), others 9s. The show tracks its place by slide key, so refreshes never reset the timer.
  - URL options: `?period=today|week|month|all`, `?interval=8`, `?limit=5`. Keys: **F** fullscreen, **Space** pause, **← →** step. Wake lock + mouse auto-hide.
  - Sizing: `.tv { --u: min(1vw, 1.7778vh) }`, everything in `em`, so it fits any 16:9/16:10 screen.
- `/join`: the page behind the TV QR (public, mobile-first). Live "today" numbers + a lift to beat (from the same TV RPCs), one-tap **Join with Google** (`signInWithGoogle("/")`, new members then hit `/welcome`), how it works, and a trust note (TV shows first name + best lift only). Signed-in visitors get a "You're in" state. `?src=tv` changes the eyebrow to "You scanned the gym screen".
- `/auth/callback`: OAuth return.
- Also: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/manifest.ts` (installable PWA, icons in `public/icons/`), `app/robots.ts`, `public/sw.js` and `public/offline.html`.

The floating nav (`components/BottomNav.tsx`) has Home (`/home`), Machines, Ranks and You. It's hidden on the landing page (`/`, `/about`), machine sub-pages, `/welcome`, `/admin` and `/tv` (it stays on `/join`), where it sets `body.no-nav`, which also moves toasts to the top.
Link previews: `app/layout.tsx` metadata (title, description, `metadataBase` from `NEXT_PUBLIC_SITE_URL`, Open Graph + Twitter card with `public/og.png`), plus `app/sitemap.ts` and `app/robots.ts` (points at the sitemap; `/tv`, `/admin`, `/settings`, `/welcome`, `/auth` disallowed).

Machine catalog: `lib/machines.ts`. The 10 entries are:

- `lat-pulldown-01`
- `chest-press-02`
- `rowing-03`
- `pec-fly-rear-delt-04` (dual mode, `?mode=pec-fly|rear-delt`)
- `shoulder-press-05`
- `biceps-preacher-06`
- `squat-07`
- `leg-press-08`
- `leg-extension-09`
- `deadlift-10`

`machine.number` is a string like `"01"`.

## 5. Database (Supabase Postgres)

Migrations live in `supabase/migrations/0001…0009`. They are the source of truth.

| File | What it adds |
|---|---|
| 0001_init | profiles, machine_stats, set_logs, attendance, feedback, tap_events, RLS, `log_set()`, `record_tap()`, is_staff protection |
| 0002_leaderboard_views | `leaderboard_overall()`, `leaderboard_machine()` |
| 0003_admin_tools | `app_timezone()`, `_period_start()`, admin views and RPCs (re-check `is_staff()`) |
| 0004_tap_source | NFC vs QR on taps |
| 0005_tv_display | `tv_boards()`, `tv_activity()` (anon allowed, names only) |
| 0006_home_feed | `post_kudos`, `feed_posts()`, `toggle_kudos()` |
| 0007_pump_photos | `pump_photos`, `photo_kudos`, `photo_reports`, private bucket + policies, photo RPCs, `feed_photos()`, moderation |
| 0008_instagram_handle | `profiles.instagram_handle`, `set_instagram_handle()`, handle in feed RPCs |
| 0010_staff_moderation | Fair play. `machine_limits` (per-machine max kg/reps, jump %, `allowed_modes`; staff-editable). BEFORE INSERT trigger `_guard_set_log` on `set_logs` **refuses**: unknown machine/side (RK003), over max weight (RK001) or reps (RK002), weights not in 0.25 kg steps (RK004), two sets within 8 s or more than 30/machine or 120/day per member (RK005). It **flags** (`set_logs.review_status='flagged'`): +40% and ≥10 kg over the member's best from before today (or over their first set today on day one), or a first set at ≥70% of max. Existing over-max sets are flagged on run and whenever a limit is lowered. Staff RPCs: `admin_review_queue`, `admin_approve_set`, `admin_remove_set` (recomputes PB via `admin_delete_set_log`, cleans kudos, notifies), `admin_reset_member_machine`, `admin_reset_machine_for_all` (keeps check-ins), `admin_set_machine_limit`, `admin_member_search`, `admin_activity`. Tables `member_notices` (members read their own; `mark_notices_seen`) and `staff_actions` (audit, staff read) |
| 0009_account_basics | `profiles.onboarded_at` (existing members backfilled on first run only), `update_my_profile(name, onboarded)`, `delete_my_account()`, a display-name length guard (≤80, NOT VALID), and a **photo privacy fix**: staff can only see photos that are shared, hidden or reported, never "Only me" ones (`_photo_has_report()`, new pump_photos + storage select policies) |

### Run state on Omi's Supabase

0001–0008 were run. The 2026 refresh code is deployed (commits `590e8b3` and `04bf162`). **The run state of 0009 and 0010 is unconfirmed.** To check, run this in the Supabase SQL Editor:

```sql
select
  exists(select 1 from information_schema.columns where table_name='profiles' and column_name='onboarded_at') as ran_0009,
  exists(select 1 from information_schema.tables where table_name='machine_limits') as ran_0010;
```

The app keeps working without them:
- **Without 0009:** no onboarding redirect, Settings falls back to a direct name update, and the delete button is hidden.
- **Without 0010:** staff tabs show a "run 0010" notice, set removal falls back to the old delete, and the log screen uses the built-in limits.

**Adding a new machine** now needs a `machine_limits` row (Staff → Machines → "Set limits", or SQL). Without one, logging on it is refused with RK003. For a dual machine, also set `allowed_modes`.

### Conventions (keep following these)

- Clients never write `set_logs` or `machine_stats` directly; only `log_set()` does (atomic, row-locked).
- Anything exposing other members' data goes through a `security definer` function with `set search_path = public` and an explicit `grant execute` to `authenticated` (TV functions also to `anon`).
- **Never return emails or user ids to other members.** Use `_public_name()`; the TV and kudos show first names only.
- Changing a function's return type means `drop function if exists …` first, then re-grant. Migrations must be safe to run twice.
- `lib/database.types.ts` is **hand-maintained**. Update it when you add a column or RPC.
- XP/level math lives in both `log_set()` and `lib/gamification.ts`. Change both together.
- `set_logs.mode` is `NULL` for single-mode machines, while `machine_stats.mode` is `''`.

## 6. The core loop: tap → log (app/machine/[id]/log/page.tsx)

- It starts at **what you did last time** on that machine and side (`fetchLastSet`, reading your own `set_logs`), then your PB, then a machine default. Chips: Last, PB and ±4 steps.
- The sticky CTA reads "Log set · 50KG × 10". It refuses while offline, and on error keeps the values and shows a toast. Database refusals (RK001–RK005) are shown word for word via `friendlyDbError()`. The weight stepper is capped at the machine's limit from `machine_limits`, and a "This machine goes up to X kg" hint is shown.
- After each set: a haptic, a toast, the set added to "This session", and the **rest timer** (`components/RestTimer.tsx`). The timer counts down from an end timestamp, so it survives the screen locking. It holds a screen wake lock while running (re-acquired when the page becomes visible again), buzzes at the end, and offers +30s and Skip. Its length is stored per device (`racked:rest-seconds`, 0 = off).
- A PB opens the full-screen celebration (`SetResultModal`): "Keep going" is the primary, focused button; Share and Back to machine are secondary.
- Effects depend on `session?.user.id`, not the session object. `AuthProvider` also keeps the same session object when auth-js re-emits `SIGNED_IN` on tab focus, so coming back to the app never resets what you typed.

## 7. Production readiness bits

- **Security headers** (`next.config.mjs`): nosniff, Referrer-Policy, X-Frame-Options SAMEORIGIN, Permissions-Policy (camera=self), HSTS, and a CSP limited to `base-uri`/`object-src`/`frame-ancestors`. No `script-src`, on purpose, so the inline theme script, Google sign-in and Supabase keep working. `poweredByHeader: false`.
- **Auth callback** and `/welcome` only redirect to in-app paths via `lib/safeNext.ts`, which rejects `//x`, control characters, backslashes and other origins.
- **Service worker** (`public/sw.js`): never caches pages or data, only shows `offline.html` when a page can't load, and is served `no-store`. It is registered only in production, from `AppEffects`. To change it, bump `CACHE` and keep it this small.
- **Offline**: `NetworkStatus` shows a banner, and logging a set refuses with a clear toast.
- **Install**: manifest + icons (any, maskable, apple-touch). Settings shows "Install app" (Chrome/Android), or how-to text on iPhone.
- **Error screens**: `app/error.tsx` (retry), `global-error.tsx`, and a helpful 404.

## 8. Working agreements with Omi

- **Pushing is authorised.** Before every push, run `npx tsc --noEmit`, `npm run lint` and `npm run build`. Use a branch for risky changes (Vercel builds preview URLs for branches), then tell Omi what changed in plain words.
- **Database changes**: add a new numbered migration. Claude Code can't run SQL on the hosted Supabase unless the Supabase CLI or a Supabase MCP is set up. Otherwise give Omi click-by-click steps (Supabase → SQL Editor → New query → paste → Run) and say "run the SQL first, then push the code". Never ask for or store the DB password, service-role key or tokens.
- Be honest about testing: say when tests ran against mocks rather than the live database.

## 9. Tests (in `tests/`, not run on deploy)

See `tests/README.md`. In short:

- `tests/sql/*.test.mjs`: apply all migrations to in-memory Postgres (PGlite, with stubs for `auth` and `storage`) and check behaviour as different users, including RLS via `set role authenticated`. Latest run: 27 + 8 passing.
- `tests/safeNext.test.ts` (`npx tsx`): 15 redirect cases.
- `tests/sql/0010_staff_moderation.test.mjs`: 63 checks on refusals, flagging (including step-climbing), staff tools, notices, RLS, backfill, kudos cleanup and idempotency.
- `tests/e2e/staff.e2e.js`: 81 checks on the staff console (every tab, reason sheets, typed confirms, the "0010 not run" fallbacks), member notes and the over-limit message, plus axe and 360px in both themes.
- `tests/e2e/landing.e2e.js`: 75 checks on the landing page + routing: visitor sees it, member at `/` lands on `/home`, `/about` for members, ticker with live / empty / failed data, hero CTA → Google with `next=/home`, the walkthrough following the scroll at 1440 and 390px with and without reduced motion, step buttons, the log screen ending on 60 kg, the embedded TV loading only when near, FAQ, og.png/manifest/sitemap/robots, no sideways scroll or clipped headlines at 360–1920px, axe at 390 and 1440. Lighthouse (production build, local): mobile performance 93–95, accessibility 100, SEO 100, CLS 0; desktop performance 100.
- `tests/e2e/tv.e2e.js`: 70 checks on the TV + `/join`: slide order, QR target, corner QR, totals/equivalent, podium + empty spots, empty-gym rotation, nothing off-screen or under the footer at 1920×1080/1280×720/1366×768/1920×1200, auto-advance surviving a mid-slide refresh and "Reconnecting" (Playwright clock), space-to-pause, no `@`/handles on the TV, `/join` live numbers, Google start + `next=/`, failure fallback, signed-in state, robots, axe + 360px in both themes.
- `tests/e2e/app.e2e.js` (Playwright): `mock.js` fakes a signed-in session (cookie `sb-placeholder-auth-token` = `base64-` + base64url session JSON) and answers every Supabase REST/RPC/storage call. It covers onboarding, the log flow, rest timer, PB, offline, settings, delete, leaderboard, locked machine, headers/manifest/sw, axe and the 360px width check. Latest run: 101/101. Needs `npm i --no-save playwright @electric-sql/pglite axe-core` and a dev server on port 3111 with a placeholder `.env.local`.
- Lessons: Next's route announcer also has `role="alert"`, so scope selectors to test ids. Mock machine ids must exist in `lib/machines.ts`. Playwright's `setOffline` doesn't affect service-worker fetches.

## 10. Known gaps / backlog

- **Privacy page** is a plain-language summary, not a legal policy. Before scaling, get a proper privacy policy (India's DPDP Act) and add a real contact email; the page currently says "ask the front desk or message the Bijlee team".
- **Account deletion** removes photo files from the browser and then calls `delete_my_account()`. If the network drops between the two, some photo rows may point at missing files until the member retries. A server route with the service-role key would make it atomic, but needs that key on Vercel.
- Deleting from `auth.users` inside `delete_my_account()` is the standard Supabase pattern but hasn't been exercised on the live project yet. Verify once with a test account.
- `components/InstagramField.tsx` is no longer used (editing moved to Settings) and can be deleted.
- Admin: no button to clear a member's Instagram handle; staff can edit `profiles` in the Supabase table editor.
- Ideas Omi has raised: video on the feed (only photos are built), streak reminders/notifications, private-only Strava (Strava's terms forbid showing one member's data to others), multi-gym support.
- Members can still edit their own `profiles` row directly via RLS (an older policy). The 0009 length guard limits the damage; consider column-level grants later.
- **Fair play:** flagged sets still count on leaderboards, the feed and the TV until staff remove them. Omi chose this over "hold until approved". To switch, add `coalesce(review_status,'') <> 'flagged'` to `leaderboard_overall`/`leaderboard_machine` (0003), `tv_boards`/`tv_activity` (0005) and `feed_posts` (0008), and stop `log_set` from raising the PB for flagged sets.
- Staff can't ban a member yet (not chosen this round).
- Landing page: no real Bijlee photos yet (`LANDING_PHOTOS` is empty), the gym name isn't set (`NEXT_PUBLIC_GYM_NAME`), and there's no custom domain yet (`NEXT_PUBLIC_SITE_URL`). Mobile Lighthouse LCP is ~2.6–3.2 s under its slow-4G simulation (target was 2.5 s); the rest of the scores are 93+.
- TV ideas not built yet (Omi didn't pick them this round): live "new PB!" pop-ups, streak shout-outs, weekly challenges. A portrait-TV layout. Counting TV sign-ups (`?src=tv` is on the URL but isn't stored anywhere yet).

## 11. How Omi starts a Claude Code session

1. Open a terminal in `D:\Racked\racked-app` and run `claude`.
2. Say: *"Read CLAUDE.md, pull the latest, and tell me what state the app is in."*
3. The first command-line `git push` may open a browser to sign in to GitHub. That's normal.

## 12. Chronology

1. Artifact prototype (Rounds 1–4), then the real Next.js + Supabase app (Round 5).
2. QR + NFC tracking (0004) and the TV screen (0005).
3. Home feed with kudos (0006) and pre/post pump photos with moderation (0007).
4. Optional photos, the Strava research (decided against), and the Instagram handle (0008, commit `e130b00`).
5. README restyle by Claude Code (commits `3f14c07`, `756f300`).
9. **Landing page + Bijlee brand (Nov 2026)**: public landing page at `/` (app home moved to `/home`, members redirected by middleware), GSAP scrollytelling with coded phone screens, live TV iframe, Bijlee Run Club section, OG image/sitemap/robots, `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_GYM_NAME`. Whole product re-coloured to Bijlee's palette (#FF482C / #F4B424 / #202018, warm near-black surfaces), the Bijlee bolt as logo/app icon/favicon/share card, slab sign-up buttons. Unbounded kept as the display font (now via next/font for preloading). No database change.
8. **TV slideshow + /join (Nov 2026, after the staff console)**: the TV became a recruiting screen: Join slide with QR, gym-today totals, podium boards with "beat" cards, muscle-group activity, empty-gym mode, corner QR everywhere, and the `/join` landing page. No database change (uses 0005's RPCs). New npm dependency: `qrcode`.
7. **Staff console + fair play (Nov 10)**: tabbed staff page, review queue, member/machine resets, editable limits, member notes, activity log, migration 0010.
6. **2026 refresh (Nov 8)**: dark-first design system, floating nav with a Machines tab, bento Home, a faster log loop (last set, rest timer, haptics, sticky CTA), onboarding, Settings (name/handle/theme/rest/vibration/sign out/delete), privacy page, PWA + offline page, skeletons and error states, security headers, open-redirect fix, self-hosted fonts, and migration 0009 including the staff photo-privacy fix.
