# Tests

Nothing here runs on Vercel — these are for checking changes before you push.
They need a few dev tools that aren't in package.json (to keep deploys lean):

```bash
npm i --no-save playwright @electric-sql/pglite axe-core
npx playwright install chromium   # once
```

## 1. Database migrations (in-memory Postgres, no Supabase needed)

```bash
node tests/sql/0009_account_basics.test.mjs
node tests/sql/0009_photo_privacy.test.mjs
node tests/sql/0010_staff_moderation.test.mjs
```

They apply every file in `supabase/migrations/` in order to a throwaway
Postgres (PGlite) with small stand-ins for Supabase's `auth` and `storage`
schemas, then check behaviour as different users.

## 2. The redirect guard

```bash
npx tsx tests/safeNext.test.ts
```

## 3. The app in a real browser (backend mocked)

```bash
# terminal 1 -- placeholder keys, never real ones
printf 'NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key\n' > .env.local
npx next dev -p 3111

# terminal 2
node tests/e2e/app.e2e.js
node tests/e2e/staff.e2e.js
node tests/e2e/tv.e2e.js      # gym TV + /join (takes ~3 min)
node tests/e2e/landing.e2e.js # landing page + / -> /home routing (takes ~4 min)
```

`tests/e2e/mock.js` fakes a signed-in member and answers every Supabase call
with sample data, so the flows (onboarding, logging a set, rest timer, PB,
offline, settings, delete account, leaderboard) can be driven end to end. It
also runs an axe accessibility scan and checks for sideways scrolling at
360px. **Delete `.env.local` when you're done** if it holds placeholder keys.
