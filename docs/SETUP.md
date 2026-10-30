# Racked by Bijlee

The real, deployable version of the Racked NFC-gym companion — Next.js 14 (App Router) + Supabase (Postgres, Auth, Realtime), replacing the Claude Artifact prototype so real members with real Google accounts can use it from anywhere, not just people in your Claude org.

Tap a machine's NFC sticker → see your history and PB → log a set → keep a streak → share a Strava-style card of your PB or leaderboard rank.

## What's different from the Artifact prototype

- **Real accounts.** Google sign-in via Supabase Auth (no more "enter a guest name" fallback) — every member's history is tied to their real Google account, and it works for anyone, not just people in your Claude org.
- **Real, tamper-resistant data.** PBs/XP/levels are written by a single atomic Postgres function (`log_set`, see `supabase/migrations/0001_init.sql`) instead of a client-side read-modify-write, so two devices logging at once can't race, and a client can't fabricate a PB by calling the database directly.
- **Live leaderboards.** The leaderboard subscribes to Postgres realtime changes — when anyone logs a set, everyone watching the leaderboard sees it update within a second or two.
- **A real admin dashboard.** Gated by an `is_staff` flag on the signed-in Google account (set once from the Supabase dashboard) instead of a shared passcode baked into the client-side JavaScript.
- **Downloads just work.** Share cards save with a plain browser download — no special capability needed, unlike inside the sandboxed Artifact viewer.

## Stack

- **Next.js 14** (App Router, TypeScript, mostly client components — this app is highly interactive)
- **Supabase**: Postgres (schema in `supabase/migrations/`), Auth (Google OAuth), Realtime
- **Tailwind CSS** for utility classes, plus the Bijlee design tokens in `app/globals.css` (ported 1:1 from the Artifact prototype's CSS custom properties)
- **Vercel** for hosting (or any Next.js host)

No other backend services are required.

## One-time setup

You'll create two free accounts if you don't already have them: **Supabase** and **Vercel**. Budget about 20 minutes.

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project. Pick a strong database password and save it somewhere.
2. Once the project is ready, open **SQL Editor** and run the two migration files in order — paste the contents of each and click Run:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_leaderboard_views.sql`
3. Open **Project Settings → API**. You'll need three values from this page in a minute: **Project URL**, the **`anon` `public`** key, and the **`service_role`** key (keep the service role key secret — never put it in `NEXT_PUBLIC_*`).

### 2. Turn on Google sign-in

1. In the Supabase dashboard, go to **Authentication → Providers → Google** and toggle it on.
2. You need a Google OAuth Client ID/Secret. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create a project (or use an existing one), then **Create Credentials → OAuth client ID → Web application**.
   - Under **Authorized redirect URIs**, add the callback URL Supabase shows you on that same Google provider settings page (it looks like `https://<your-project-ref>.supabase.co/auth/v1/callback`).
   - Copy the generated **Client ID** and **Client Secret** back into the Supabase Google provider settings and save.
3. In **Authentication → URL Configuration**, set the **Site URL** to your production URL once you have it (step 4 below) — you can leave it as `http://localhost:3000` for now and come back to update it after deploying.

### 3. Configure the app locally

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API. Then:

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you should see the home screen. Sign in with Google to confirm auth works end to end.

**Optional — seed demo data** so the leaderboard/admin dashboard aren't empty on day one:

```bash
# also fill in SUPABASE_SERVICE_ROLE_KEY in .env.local first
npm run seed
```

This creates ~15 fake members with realistic PBs, streaks, and some sample feedback/tap analytics. It only ever touches accounts it creates itself (emails ending in `@demo.rackedbybijlee.test`) — safe to run even after real members have signed up.

### 4. Deploy to Vercel

1. Push this folder to a GitHub repo (or use `vercel` CLI directly from this folder).
2. Go to [vercel.com](https://vercel.com), **Add New → Project**, import the repo.
3. Add the same two `NEXT_PUBLIC_*` environment variables from step 3 (Vercel project → Settings → Environment Variables). You don't need the service-role key on Vercel — that's only for the local seed script.
4. Deploy. Vercel gives you a URL like `https://racked-by-bijlee.vercel.app` (or point a custom domain like `app.bijlee.run` at it from Vercel's Domains settings).
5. Back in Supabase → **Authentication → URL Configuration**, set **Site URL** to that production URL, and add it (plus `http://localhost:3000` for local dev) under **Redirect URLs**.

That's it — the app is live. Anyone can open the URL, sign in with their own Google account, and start logging sets.

### 5. Make yourself (and other staff) admins

The first admin has to be set directly in the database — there's no self-serve "become staff" button by design (so a member can't just grant themselves admin access):

1. Sign in to the live app once with the Google account that should be staff.
2. In Supabase → **SQL Editor**, run:
   ```sql
   update public.profiles set is_staff = true where id = '<that account's user id>';
   ```
   Find the user id in **Authentication → Users**, or in the `profiles` table by matching `display_name`.
3. That account can now open `/admin` on the live site. From then on, any existing staff member can promote another member to staff the same way (or you can keep doing it from SQL Editor).

### 6. Point your NFC stickers here

Write each machine's sticker with a URL like:

```
https://your-domain.com/machine/lat-pulldown-01
```

The 9 machine ids are in `lib/machines.ts` (`MACHINE_IDS`). The dual-mode Pec Fly / Rear Delt machine also takes a `?mode=pec-fly` or `?mode=rear-delt` query param if you want a sticker to default to one side.

## Project structure

```
app/                    Next.js App Router pages (mostly client components)
  machine/[id]/         machine detail, guide, log-set, feedback
  leaderboard/          overall + per-machine leaderboards (realtime)
  profile/              attendance calendar, streaks, your machines
  admin/                staff-gated dashboard
  auth/callback/        Google OAuth redirect handler
components/             shared UI (icons, cards, calendar, share sheet, ...)
lib/
  machines.ts           the 9-machine catalog (static content, edit here)
  gamification.ts       XP/PB/level math (client-side preview copy)
  streaks.ts            attendance streak + calendar-grid math
  shareCard.ts           canvas-drawn Strava-style share card
  data.ts               typed Supabase queries used by the pages
  supabase/              browser / server / middleware Supabase clients
supabase/migrations/     the whole Postgres schema, RLS policies, and the
                         log_set()/record_tap() functions — the source of
                         truth for the database. Re-run in order on a fresh
                         project.
scripts/seed.ts          optional demo-data seeder (npm run seed)
```

## Editing the machine catalog

Machine names, instructions, mistakes, tips, and challenge targets all live in `lib/machines.ts` as plain data — no database migration needed to add a machine or tweak copy. If you add a new machine id, update any physical NFC stickers to match.

## Notes on the gamification math

`log_set()` in `supabase/migrations/0001_init.sql` is the single source of truth for PBs, XP, and levels — it's what actually gets called, atomically, every time someone logs a set. `lib/gamification.ts` has a client-side copy of the same math (used for lightweight UI previews); if you ever change the XP table or leveling curve, change both, or the copies will drift.

## Known simplifications vs. a bespoke build

- Admin identity is a boolean flag on a Google account rather than a separate staff-invite flow — fine for a single gym, less so for a multi-location chain (that would want a `staff` join table scoped per location).
- Feedback status has three states (open/dismissed/resolved) rather than the original demo's four — merge in an `in_progress` status if you want that distinction back.
- No push notifications for streak reminders yet — everything is pull-based (open the app to see your streak).
