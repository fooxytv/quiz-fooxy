# Marvel Wordle

A Wordle-style Marvel quiz built for a team sprint review. People scan a QR code,
play twelve words on their phone or laptop, and the host watches a live
leaderboard on the shared screen. Most words solved wins; if that ties, the
fastest total time takes it.

No accounts, no sign-in, no app. Open the link and type your name.

## Why it is server-authoritative

Two things are deliberately kept out of the browser:

- **The answers.** The client never receives a word until that puzzle is over. A
  guess is posted to the server, which marks it and sends back only the colours.
  Opening devtools tells you nothing.
- **The clock.** Each puzzle's start time is stamped server-side and the timeout
  is enforced there, so a fast total time cannot be faked. Since time decides the
  winner, this matters.

## Stack

Node 24 (`node:sqlite`, built in — no native modules to compile), Express, `ws`
for live updates, and `qrcode` to render the join code server-side. One container
plus a `cloudflared` sidecar. State lives in SQLite on a volume and survives
restarts, so you get history across sessions rather than one throwaway game.

## Running it

```bash
cp .env.example .env     # then fill in the Cloudflare Access values
docker compose up -d --build
```

Locally, without Cloudflare:

```bash
npm install
npm run dev              # http://localhost:3000 and /admin via the loopback bypass
```

`npm run dev` sets `ADMIN_DEV_BYPASS=1`, which lets **loopback requests only**
reach the admin portal with no Access token. Never set it on the deployed
container.

## Cloudflare setup

**1. Tunnel.** In Zero Trust → Networks → Tunnels, create a tunnel, copy its
token into `TUNNEL_TOKEN` in `.env`, and add a public hostname:

| | |
|---|---|
| Subdomain | `quiz` |
| Domain | `fooxy.tv` |
| Service | `http://quiz:3000` |

`quiz` is the compose service name, so the tunnel reaches it over the compose
network. The app publishes no ports to the host.

**2. Access policy on the admin portal.** In Zero Trust → Access →
Applications, add a self-hosted application:

- Paths: `quiz.fooxy.tv/admin` and `quiz.fooxy.tv/api/admin`
- Policy: Allow, with an Emails rule naming your own address

Then copy the application's **Application Audience (AUD) Tag** into
`CF_ACCESS_AUD`, and your team domain (e.g. `yourteam.cloudflareaccess.com`)
into `CF_ACCESS_TEAM_DOMAIN`.

Leave the rest of the site public — that is the point, so players need no
account.

> With `CF_ACCESS_AUD` unset the admin portal refuses every request rather than
> falling open. The app verifies the JWT itself, so reaching the origin by some
> other route does not get you in.

## Hosting a session

1. Open `/admin` and leave it on **Join screen**. Project it.
2. People scan the QR, type a name, and start. Names appear as they arrive.
3. Pick a **time limit per word** (default 90s, or off). It applies immediately.
4. Flip to **Leaderboard** when everyone is in. Times tick live.
5. **Remove** takes someone off the board; they can be let back in, keeping the
   run they had.
6. **Reset the whole quiz** wipes every run and restarts. Players' pages restart
   on their own, keeping their names.

Destructive buttons need two taps — no accidental mid-session wipe.

## Changing the words

The **Words** tab in the admin portal edits the list as JSON, saved to
`DATA_DIR/words.json`. Answers are 4–8 letters, A–Z only, each needs a clue, and
a clue containing its own answer is refused. Changes apply on the **next reset**,
so a round in progress is never disturbed. Delete the file to fall back to the
twelve built-in puzzles.

## Layout

```
src/words.js    the puzzles, and the only shape a client may see
src/game.js     marking, scoring, ranking
src/db.js       SQLite schema and queries
src/auth.js     Cloudflare Access JWT verification
src/server.js   HTTP + WebSocket
public/         player page, host portal, shared stylesheet
```

## API

Player endpoints carry an httpOnly cookie as identity. Everything under
`/api/admin` sits behind Cloudflare Access.

| | |
|---|---|
| `POST /api/join` | `{name}` → player state |
| `GET /api/state` | resume after a reload or a dropped connection |
| `POST /api/guess` | `{guess}` → marks, tries left, answer once finished |
| `POST /api/next` | advance, stamping the next word's start time |
| `WS /ws` | round and removal events |
| `GET /api/admin/board` | full leaderboard |
| `POST /api/admin/limit` | `{limitMs}` |
| `POST /api/admin/reset` | new round, board wiped |
| `POST /api/admin/kick` / `unkick` | `{playerId}` |
| `GET` / `PUT /api/admin/words` | read and replace the word list |
| `WS /ws/admin` | live leaderboard stream |

## Tests

`npm test` against a running server (see `test/smoke.mjs`) exercises joining, marking,
duplicate letters, answer withholding, the timeout, kick and reinstate, word-list
validation and reset. Thirty-eight checks, including an explicit assertion that
no answer appears anywhere in the board payload.
