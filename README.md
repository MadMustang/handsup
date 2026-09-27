# handsup ✋

A fun little application for anonymous online polling. A host asks one question, friends join with a
6-character room code, and everyone watches the results move live. No sign-up, no backend server:
everything runs on [Supabase](https://supabase.com).

## Features

- **Create a poll**: one question, 2–6 options. Get a room code and an invite link.
- **Vote without an account**: each browser gets a silent anonymous sign-in. One vote per person;
  tapping another option changes your vote.
- **Live results**: bars and counts update for everyone as votes come in.
- **Who's here**: live count of people currently in the room.
- **Close / reopen voting** (host only): voting buttons turn off for everyone instantly.

## Stack

| Piece | Used for |
|---|---|
| Vite + TypeScript (no framework) | the web app |
| `@supabase/supabase-js` | talking to Supabase from the browser |
| Supabase Auth (anonymous sign-ins) | a user identity per browser |
| Postgres + Row Level Security | storing polls/votes and enforcing who may do what |
| Supabase Realtime | live vote updates, poll open/closed, presence |

## Setup

### 1. Supabase project (dashboard)

1. Create a project (the Singapore region is closest for Southeast Asia). Save the database password in a password manager.
2. On creation: **Enable Data API** ✅, **Enable automatic RLS** ✅, **Automatically expose new tables** ⬜.
   The migration grants table access explicitly.
3. **Authentication → Sign In / Providers**: enable **Allow anonymous sign-ins**.
4. **Authentication → URL Configuration**: Site URL `http://localhost:5173`.
5. Optional: **Authentication → Rate Limits**. Raise the anonymous sign-in limit (default ~30/hour per IP)
   if many people will join from the same network.
6. **SQL Editor**: paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

### 2. Local env

Create `.env.local` (gitignored) with values from **Project Settings → Data API / API Keys**:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the base URL only (no `/rest/v1/`). Use the **publishable** key; never put the secret key in this app.

### 3. Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Testing with multiple people locally

The anonymous session lives in the browser's localStorage, so **tabs and windows of the same browser are the
same user**. To act as a second voter, open the invite link in:

- a private/incognito window,
- a different browser or browser profile, or
- `http://127.0.0.1:5173` instead of `localhost` (different origin, separate storage).

## How it works

```
index.html → src/main.ts     router: #/ (home) and #/p/CODE (poll room)
             src/supabase.ts  client + anonymous sign-in (reuses stored session)
             src/poll.ts      poll room: load, vote, realtime, presence, host controls
supabase/migrations/          database schema, applied by hand in the SQL Editor
```

**Database**

- `polls`: `code` (random 6 hex chars), `host_id`, `question`, `options text[]`, `is_open`.
- `votes`: one row per `(poll_id, user_id)`, which is the primary key, so one vote per person.

**Security (RLS)**: signed-in users can read polls and votes. Only the host can create and close their
poll. You can only cast or change your own vote, only while the poll is open, and only for an existing
option. Nobody can delete.

**Realtime**: each room subscribes to one channel, `poll:CODE`, that carries vote inserts/updates, poll
updates (open/closed) and presence.

## Known limits

- Anyone can vote again from a private window. Each one is a fresh anonymous user. Fine for fun polls;
  use real login or CAPTCHA if it matters.
- Any signed-in user can read any poll if they know how to query the API. The room code isn't a secret.
- Free Supabase projects pause after ~7 days of inactivity (restore from the dashboard, data is kept).

## Status and ideas

**Done**

- [x] Anonymous auth
- [x] Create poll and join by code
- [x] Voting and changing your vote
- [x] Live results and presence
- [x] Close/reopen

**Ideas**

- [ ] Deploy (Cloudflare Pages / Netlify)
- [ ] QR code for the invite link
- [ ] Multi-question quizzes
- [ ] Host can remove spam votes

## License

[MIT](LICENSE)
