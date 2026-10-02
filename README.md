# MCU Quiz

A Wordle-style superhero-film quiz built for a team sprint review. People scan a
QR code, wait in a lobby, and the host counts everyone in together. Twelve words,
six guesses each. Most words solved wins; if that ties, the fastest total time
takes it.

No accounts, no sign-in, no app. Open the link and type your name.

## On the look

The badge, the three background scenes and all the audio are original work made
for this repo — nothing here is a frame, still, logo or recording from any film.
The quiz asks about Marvel films because that is the subject, which is ordinary
referential use, the same as any pub quiz.

The on-screen name comes from the active theme, so changing it is a one-line edit
in a theme file rather than a hunt through the markup.

## Why it is server-authoritative

Two things are deliberately kept out of the browser:

- **The answers.** The client never receives a word until that puzzle is over. A
  guess is posted to the server, which marks it and sends back only the colours.
  Opening devtools tells you nothing.
- **The clock.** Each puzzle's start time is stamped server-side and the timeout
  is enforced there, so a fast total time cannot be faked. Since time decides the
  winner, this matters.

## How a session runs

A pool of 100 words in six tiers — **warm up, easy, steady, tricky, hard,
brutal** — and the host picks how many questions a round runs to (5, 10, 15, 20,
25 or 30). Answers are 3 to 12 letters; the grid tightens its spacing and type to
fit even SVARTALFHEIM on a phone.

**Every player gets their own draw.** Each round is assembled per person from the
pool, stratified so everybody climbs the same difficulty curve on different
words. The person beside you is not on the same question, so a glance at their
screen tells you nothing and shouting an answer across the room does not help.

That is not the same as no overlap. Drawing *k* words from a tier holding *m*
means two players share about *k²/m* of them, and shallow tiers dominate — with
three warm-ups in the pool, both players will usually get two of the same three.
The host screen prints the real figure for the chosen length:

| round length | words two players share | |
|---|---|---|
| 10 | ~1.2 | 12% of the round |
| 20 | ~4.1 | 21% |
| 30 | ~9.4 | 31% |

Shorter rounds are more distinct, and adding words to the thin tiers helps most —
the host panel shows the depth of each. What matters for copying is that the word
at *position seven* differs, and it does.

Players land in a **lobby**: no clue, no clock, nothing to do but wait. The
server does not even deal them a puzzle yet. When the host presses **Start**,
everyone gets the same countdown and the first word appears for all of them at a
single shared instant — the server stamps one `starts_at` and writes it to every
waiting player's first puzzle, so network jitter cannot hand anyone a head start.

From there it is a race at each person's own pace. Someone who joins after the go
starts their own clock then and is flagged `late` on the board, so you can see it
rather than wonder.

A reset puts everybody back in the lobby, ready to run it again.

## Themes

The look is swappable from the host screen, live, without reloading anyone's page
or disturbing a round. Three ship built in:

- **Tactical Readout** — the default, and the one that fits a film quiz best:
  counter-rotating instrument rings over a receding floor grid, a scan sweep,
  corner brackets, square corners and cyan rules. Steel and cyan, built for a
  projector.
- **Cosmic Gauntlet** — deep space with a nebula wash, parallax starfield, rising
  embers and a pulsing core. Panels on frosted glass.
- **Comic Press** — halftone dots, speed lines and inked panels on newsprint. The
  light-room option.

The two dark themes carry a looping title card whose letters drop in one at a
time.

A theme is a palette, a wordmark, a background scene and an optional intro card.
Drop a JSON file into the data volume at `themes/` and it appears in the Themes
tab with no rebuild — see `examples/themes/` for two working files and the full
field list. Palette values are restricted to a whitelist of tokens and accepted
only as hex, so a theme cannot inject CSS; a bad one is logged and skipped rather
than breaking the page.

`backdropImage` names a file you put in the volume's `assets/` folder, layered
behind the scene, if you want a still of your own back there.

## Artwork and music

Everything is generated at run time; there are no media files in this repo and
nothing is sampled, traced or transcribed from anyone's property.

- `public/scenes.js` holds the three background scenes. Each caps device pixel ratio
  at 2, scales its particle budget to the canvas area, stops animating while the
  tab is hidden, and draws a single static frame under
  `prefers-reduced-motion`. Dot spacing scales with the canvas so the per-frame
  draw count stays near 6,500 at any resolution — a fixed grid was ~8,600 ops a
  frame at 1080p and ~32,000 at 4K, which drops frames on exactly the big screen
  this is for.
- `public/art.js` draws the hexagonal badge, the ink starbursts behind the
  countdown, and the burst that pops when a word falls.
- `public/theme.js` applies a theme and runs the looping title card.
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

Node 24 (`node:sqlite`, built in — no native modules to compile; the module
exists from Node 22.5, and 24 is what the image ships and the tests run on), Express, `ws`
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
| `./scripts/doctor.sh` | collect versions and logs when something will not start |

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

## When a build or start fails

```bash
./scripts/doctor.sh                       # versions, images, logs, ports, disk
./scripts/local.sh 2>&1 | tee /tmp/quiz-build.log
```

All three build scripts pass `--pull`, so a stale local `node:24` tag cannot be
picked up — that is the usual cause of an otherwise inexplicable failure about
`node:sqlite`, since an old base image would not have the module. If the runtime
really is too old the app now exits with an instruction naming the Node version
it found, rather than an `ERR_UNKNOWN_BUILTIN_MODULE` stack.

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
3. Set **questions per round** (lobby only — it is locked once a round is under
   way). The panel shows how deep each tier is and how much two players will
   overlap at that length.
4. Optionally switch **theme** — *Cosmic Gauntlet* is the one for a projector.
5. Pick a **time limit per word** (default 90s, or off) and a **countdown**
   length (3s, 5s, 10s or 30s). The settings panel prints a live estimate of how
   long the round will take, so you can fit the slot:

   | 20 words at | typically | worst case |
   |---|---|---|
   | 45s | ~10 min | 18 min |
   | 60s | ~13 min | 23 min |
   | 90s | ~18 min | 33 min |
6. Press **Start the quiz**. Everyone sees the same countdown; the host view
   flips itself to the leaderboard so you can watch.
7. **Remove** takes someone off the board; they can be let back in, keeping the
   run they had.
8. **Reset and kick everyone** clears the board and throws every player out to
   the join screen; each of them has to join again deliberately. Anyone you
   removed **stays removed** — only *Let back in* undoes that.

Destructive buttons need two taps — no accidental mid-session wipe.

## Changing the words

The **Words** tab in the admin portal edits the list as JSON, saved to
`DATA_DIR/words.json`. Answers are 3–12 letters, A–Z only, each needs a clue, and a clue containing its
own answer is refused. `tier` should be one of the six names so the draw can
place it; anything else is treated as mid-difficulty. Changes apply on the **next reset**,
so a round in progress is never disturbed. Delete the file to fall back to the
hundred built-in puzzles.

## Layout

```
src/words.js      the puzzles, and the only shape a client may see
src/game.js       marking, scoring, ranking
src/db.js         SQLite schema, queries, round phases
src/auth.js       Cloudflare Access JWT verification
src/themes.js     built-in themes, and loading your own
src/server.js     HTTP + WebSocket
public/app.js     player client (holds no answers, keeps no authority)
public/admin.js   host portal
public/art.js     badge, starbursts, ink bursts
public/scenes.js  background scenes (comic, cosmic)
public/theme.js   theme application and the intro card
public/sound.js   procedural audio
public/styles.css one stylesheet, both themes
scripts/          build, deploy, local, logs, backup, doctor
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
| `POST /api/admin/count` | `{count}` → questions per round, lobby only |
| `POST /api/admin/limit` | `{limitMs}` |
| `POST /api/admin/reset` | new round, board wiped |
| `POST /api/admin/kick` / `unkick` | `{playerId}` |
| `GET` / `PUT /api/admin/words` | read and replace the word list |
| `GET /api/theme` | the active theme (public; every page needs it to paint) |
| `GET /api/admin/themes` | every theme, and which is live |
| `POST /api/admin/theme` | `{id}` → switch for everyone at once |
| `WS /ws/admin` | live leaderboard stream |

## Tests

```bash
./scripts/local.sh && ./scripts/local.sh test
```

Or without Docker: `npm run dev` in one terminal, `npm test` in another.

Ninety-two checks against a live server (`test/smoke.mjs`), driving two players at
once: the lobby refusing guesses before the go, the clue staying hidden through
the countdown, **both players receiving a byte-identical start instant**, marking
and duplicate letters, answers staying withheld until a word closes, the
server-enforced timeout, kick and reinstate, word-list validation, and a reset
returning the round to the lobby and ejecting everyone while keeping removals.
One check asserts that no answer appears anywhere in the board payload. The
suite resets the round itself at the start, so it is safe to re-run against a
long-lived container. The theme API is covered too, including a rejected unknown
theme and a path-traversal attempt on the assets route. Per-player draws are
covered from both ends: eight live players confirmed to open on the same tier but
not all on the same word, and the draw itself asserted to ascend, never repeat,
and differ across 40 draws. The live check uses eight players rather than four
because with three warm-up words four would collide by chance about once in
twenty runs, and a flaky test is worse than no test.

The scenes are additionally executed headlessly against a recording canvas stub
(`node /tmp/scenecheck.mjs` pattern) to prove 120 frames run at both desktop and
phone sizes with no `NaN`, `undefined` or malformed colour ever reaching the
canvas API.
