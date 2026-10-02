# Six Panels

A Wordle-style superhero-film quiz built for a team sprint review. People scan a
QR code, wait in a lobby, and the host counts everyone in together. Twelve words,
six guesses each. Most words solved wins; if that ties, the fastest total time
takes it.

No accounts, no sign-in, no app. Open the link and type your name.

## On the name and the look

The quiz asks about Marvel films, because that is the subject. It is not branded
as a Marvel product: the badge, the artwork and the music are all original work
made for this repo, and the on-screen name is **Six Panels** — six guesses, six
panels — rather than a lockup of somebody else's trademark.

Asking "which Asgardian swings a hammer" is ordinary referential use, the same as
any pub quiz. Wrapping the page in a publisher's wordmark and logo is a different
thing, so it does not. If you would rather it said something else, the wordmark is
two spans near the top of `public/index.html` and `public/admin.html`.

## Why it is server-authoritative

Two things are deliberately kept out of the browser:

- **The answers.** The client never receives a word until that puzzle is over. A
  guess is posted to the server, which marks it and sends back only the colours.
  Opening devtools tells you nothing.
- **The clock.** Each puzzle's start time is stamped server-side and the timeout
  is enforced there, so a fast total time cannot be faked. Since time decides the
  winner, this matters.

## How a session runs

Players land in a **lobby**: no clue, no clock, nothing to do but wait. The
server does not even deal them a puzzle yet. When the host presses **Start**,
everyone gets the same countdown and the first word appears for all of them at a
single shared instant — the server stamps one `starts_at` and writes it to every
waiting player's first puzzle, so network jitter cannot hand anyone a head start.

From there it is a race at each person's own pace. Someone who joins after the go
starts their own clock then and is flagged `late` on the board, so you can see it
rather than wonder.

A reset puts everybody back in the lobby, ready to run it again.

## Artwork and music

Everything is generated at run time; there are no media files in this repo and
nothing is sampled, traced or transcribed from anyone's property.

- `public/art.js` draws the backdrop on a canvas — drifting halftone dots and
  raking speed lines — plus the hexagonal badge, ink starbursts behind the
  countdown, and the burst that pops when a word falls. It reads its colours from
  the CSS custom properties, so it follows both themes, and it holds still for
  `prefers-reduced-motion`.
- `public/sound.js` synthesises its audio from oscillators and filtered noise via
  Web Audio. The lobby bed is a plain four-bar minor loop (a chord sequence,
  which nobody owns) under a motif written for this page, with a timpani pulse;
  on top of that sit countdown pips, a hit on the go, and short stings for a
  solve or a miss.

**Sound is off until someone turns it on**, and the choice is remembered per
device. The full lobby bed plays only on the **host** screen, which is the one
wired to the room's speakers; players' phones get the short effects only, because
a dozen handsets playing the same loop a few milliseconds apart sounds like a
fault. There is a Sound button in the header of both pages.

## Stack

Node 24 (`node:sqlite`, built in — no native modules to compile), Express, `ws`
for live updates, and `qrcode` to render the join code server-side. One container
plus a `cloudflared` sidecar. State lives in SQLite on a volume and survives
restarts, so you get history across sessions rather than one throwaway game.

## Testing it locally, in Docker

No Cloudflare, no `.env`, no npm:

```bash
./scripts/local.sh              # build, run, print the URLs
```

Players on `http://localhost:8099`, host portal on `http://localhost:8099/admin`.

```bash
./scripts/local.sh lan          # bind all interfaces, so a phone can scan the QR
./scripts/local.sh test         # the full suite, against the container
./scripts/local.sh logs
./scripts/local.sh down         # stop (keeps the local database)
./scripts/local.sh fresh        # wipe the local database and restart
```

`lan` works out this machine's address and sets `PUBLIC_URL` to it, so the QR
code on the host screen resolves from a phone on the same network — the quickest
way to try the whole flow before it touches the server.

**Why the host portal needs a flag locally.** The bypass for local work only
trusts loopback, and a container never sees loopback: a request through a
published port arrives from the Docker bridge, so `/admin` would 403. The local
stack therefore sets `ADMIN_INSECURE_LOCAL=1`, which widens that to private
address ranges — and the app honours it **only when `NODE_ENV` is not
production**. The deployed image sets `NODE_ENV=production`, so this flag cannot
open the admin portal on your server even if it is left in a `.env` there.
`deploy.sh` refuses to deploy if it finds it anyway.

Verified, on the real image:

| | |
|---|---|
| local stack, `/admin` | 200 |
| production `NODE_ENV`, flag still set, every admin route and the admin WebSocket | 403 |
| forged `alg:none` Access token, header and cookie | 403 |
| players, in both | 200 |

## Running it on your server

```bash
git clone https://github.com/fooxytv/quiz-fooxy.git && cd quiz-fooxy
cp .env.example .env     # then fill in the Cloudflare values
./scripts/deploy.sh
```

`deploy.sh` builds the image, brings the stack up, waits for the container to
report healthy, and prints the player and host URLs. If the build fails or the
container comes up unhealthy it shows you the last 40 log lines and exits
non-zero, rather than claiming success.

| | |
|---|---|
| `./scripts/build.sh` | build the image only, tagged `latest` and the git sha |
| `./scripts/deploy.sh` | build, start, wait for healthy |
| `./scripts/logs.sh [service]` | follow the logs (`quiz` by default, or `tunnel`) |
| `./scripts/backup.sh [dir]` | consistent SQLite snapshot plus the word list |
| `./scripts/local.sh` | run it locally in Docker, no Cloudflare needed |

`deploy.sh` warns if `CF_ACCESS_AUD` or `CF_ACCESS_TEAM_DOMAIN` are still unset
or left as the placeholder — the admin portal refuses everything in that state,
so it is better to hear about it before the review than during it.

To redeploy after a change: `git pull && ./scripts/deploy.sh`. The SQLite file
lives in the `quiz-data` volume, so results survive rebuilds.

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

1. Open `/admin`, leave it on **Join screen**, and project it. Turn **Sound on**
   if the screen has speakers.
2. People scan the QR, type a name, and land in the lobby. Names appear as they
   arrive. Nobody's clock is running.
3. Pick a **time limit per word** (default 90s, or off) and a **countdown**
   length (3s, 5s, 10s or 30s).
4. Press **Start the quiz**. Everyone sees the same countdown; the host view
   flips itself to the leaderboard so you can watch.
5. **Remove** takes someone off the board; they can be let back in, keeping the
   run they had.
6. **Reset to the lobby** wipes every run and gathers everyone again for another
   go. Players' pages return to the lobby on their own, keeping their names.

Destructive buttons need two taps — no accidental mid-session wipe.

## Changing the words

The **Words** tab in the admin portal edits the list as JSON, saved to
`DATA_DIR/words.json`. Answers are 4–8 letters, A–Z only, each needs a clue, and
a clue containing its own answer is refused. Changes apply on the **next reset**,
so a round in progress is never disturbed. Delete the file to fall back to the
twelve built-in puzzles.

## Layout

```
src/words.js      the puzzles, and the only shape a client may see
src/game.js       marking, scoring, ranking
src/db.js         SQLite schema, queries, round phases
src/auth.js       Cloudflare Access JWT verification
src/server.js     HTTP + WebSocket
public/app.js     player client (holds no answers, keeps no authority)
public/admin.js   host portal
public/art.js     procedural comic artwork
public/sound.js   procedural audio
public/styles.css one stylesheet, both themes
scripts/          build, deploy, local, logs, backup
test/smoke.mjs    end-to-end suite
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
| `POST /api/admin/start` | `{countdownMs}` → leaves the lobby on a shared instant |
| `POST /api/admin/limit` | `{limitMs}` |
| `POST /api/admin/reset` | new round, board wiped |
| `POST /api/admin/kick` / `unkick` | `{playerId}` |
| `GET` / `PUT /api/admin/words` | read and replace the word list |
| `WS /ws/admin` | live leaderboard stream |

## Tests

```bash
./scripts/local.sh && ./scripts/local.sh test
```

Or without Docker: `npm run dev` in one terminal, `npm test` in another.

Fifty-two checks against a live server (`test/smoke.mjs`), driving two players at
once: the lobby refusing guesses before the go, the clue staying hidden through
the countdown, **both players receiving a byte-identical start instant**, marking
and duplicate letters, answers staying withheld until a word closes, the
server-enforced timeout, kick and reinstate, word-list validation, and a reset
returning the round to the lobby. One check asserts that no answer appears
anywhere in the board payload.
