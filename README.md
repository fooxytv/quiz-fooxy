# Marvel Quiz

A Wordle-style superhero-film quiz built for a team sprint review. People scan a
QR code, wait in a lobby, and the host counts everyone in together. Six guesses
per word, and everyone gets their own words. Most solved wins; if that ties, the
fastest total time takes it.

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

## Levels

A quiz nobody can answer is not fun, so the host picks which end of the pool a round
draws on. Open on Level 1, and move up between rounds only if people are enjoying it.

| | draws on | feels like |
|---|---|---|
| **Level 1** *(default)* | warm up + easy | everyone gets nearly all of them |
| **Level 2** | easy + steady | a few make you think |
| **Level 3** | steady + tricky | you need to have watched |
| **Level 4** | tricky + hard | for the ones who know |
| **Level 5** | hard + brutal | deliberately unkind |
| **Mixed** | all six tiers | one round that ramps the whole way |

**Nothing is ever removed from the word list.** The X-Men, the Secret Wars deep cuts
and the Phase 4 names all stay; the level simply decides which tiers a round reaches
into. The level is lobby-only, since changing it mid-round would mean redrawing
sequences people are partway through.

The easy end is deliberately all Infinity Saga — Iron Man through Endgame — and
includes real surnames like Stark, Rogers, Banner, Parker, Barton and Romanoff,
because those are satisfying to get.

## Points

Ranking is on **points**, then time, then fewest guesses — so leaning on the aids
costs you, and two people on the same number of words are not equal.

| | |
|---|---|
| a solved word | 100 |
| each guess you did not need | +10 |
| a letter you chose to take | −15 |
| a bigger hint | −10 |
| letters the level handed out | free — everyone got them |

A solve never drops below 10, so it always beats a miss however much help it needed.
A first-guess solve unaided is 150.

The leaderboard re-sorts **live** as the clocks tick, not only when someone acts, and
a row flashes green when it moves up. The heading names whoever is leading.

## Help, for when the words are too hard

The brutal tier is genuinely brutal, so how much help a round gives is **one
setting** on the host screen rather than three:

| | opens with | another letter costs |
|---|---|---|
| **Off** | nothing | a sixth of the word's clock (15s at 90s) |
| **Helpful** *(default)* | 1 letter showing | 10s |
| **Generous** | 2 letters showing | nothing |

A given letter **lands in the grid, in its own square**, locked and green, on every
row still to come — not in a separate hangman-style line underneath. You then type
only into the squares still blank, so a six-letter word with two letters given takes
four keystrokes, and the guess is assembled from both halves when you press Enter.
Given letters light up green on the keyboard too.

Players can take **as many letters as they like** at any level — the only limit is
that the last unknown letter is never given, so the word still has to be typed.
A letter is paid for by moving that word's start time *backwards*, which is one
mechanism doing both halves of the trade: less time left, more time recorded.

**Bigger hint** is always free and never costs the clock. It gives the shape of the
word rather than prose, so it exists for all 126 answers and cannot be factually
wrong:

> starts with D · ends with L · 4 vowels · a letter appears twice

**Skip it** gives a word up as missed and spends one of a host-set allowance (0–5,
default 3). The real price is the lost solve, since solved count outranks time.

Letters, hints and skips each get a leaderboard column, and a skipped word gets a
hatched pip distinct from a plain miss, so you can see who leaned on what. Per-word
limits run up to five minutes.

## How a session runs

A pool of 135 words in six tiers — **warm up, easy, steady, tricky, hard,
brutal** — MCU, X-Men, and the deep Secret Wars and Battleworld corners — and the host picks
both the **level** and how many questions a round runs to (5, 10, 15, 20,
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
| 10 | ~0.9 | 9% of the round |
| 20 | ~3.4 | 17% |
| 30 | ~7.6 | 25% |

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

- **Comic Press** — the default. A page coming off the press: three ink screens
  at different angles, deliberately **out of register**, which is the strongest
  cue that something was printed rather than drawn. Speed lines, drifting ink
  burst outlines, paper grain and scanned-page edge darkening, over a proper
  newsprint palette with a late-edition dark variant. Panels get heavier borders,
  buttons press into the page, and the title card is printed lettering — gold
  fill, hard ink edge, red drop.
- **Tactical Readout** — the briefing-screen look: counter-rotating instrument
  rings over a receding floor grid, a scan sweep and corner brackets, in steel
  and cyan.
- **Cosmic Gauntlet** — deep space with a nebula wash, parallax starfield, rising
  embers and a pulsing core. Panels on frosted glass.

Each theme carries a title card whose letters drop in one at a time. It
covers the screen, so it **never plays by itself**: the host presses *Play title
card*, or switches *Loop it* on for an unattended lobby screen. It is never shown
on a player's device, where it would sit over the game.

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
  this is for. The press scene draws three colour screens inside that same budget
  by projecting the viewport's corners back into each rotated lattice to bound
  the loop — iterating a square span over the diagonal instead visited about ten
  times as many cells as it drew.
- `public/art.js` draws the hexagonal badge, the ink starbursts behind the
  countdown, and the burst that pops when a word falls.
- `public/theme.js` applies a theme and runs the looping title card.
- `public/sound.js` synthesises its audio from oscillators and filtered noise via
  Web Audio. The lobby bed is a plain four-bar minor loop (a chord sequence,
  which nobody owns) under a motif written for this page, with a timpani pulse;
  on top of that sit countdown pips, a hit on the go, and short stings for a
  solve or a miss.

**Sound is off until someone turns it on** — the button is in the header, and
switching it on plays a short rising chime so you know it took. The choice is
remembered per device.

Two separate faults made "no music" a real report rather than a misunderstanding.

**It was mixed far too quietly.** The chord bed sat at about −32 dBFS — present in
the arithmetic, inaudible on laptop speakers. Only the drum and the confirmation
chime were ever loud enough to notice. Levels are now mixed for a room (bed around
−17 dBFS) with a compressor on the bus for headroom, since the louder voices sum
to about 0.66 at peak.

**And the context could never unlock.** Browsers create an audio context suspended
and refuse to resume one without a user gesture, so a page loading with the
preference already on would sit silent while the button claimed otherwise. Any
click or key press now unlocks it, a button that is on-but-locked unlocks rather
than muting, and until then the label reads **Sound on - tap** and pulses.

The host screen has a **Test sound** button that plays two bars on demand without
needing to be in a lobby, beside a readout of the actual audio state — running,
suspended, or off — so a silent room is diagnosable rather than mysterious. The full lobby bed plays only on the **host** screen, which is the one
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
cp .env.example .env     # then fill in the four required values
./scripts/deploy.sh
```

`.env` needs four things filled in, and `deploy.sh` checks each before it builds:

| | |
|---|---|
| `TUNNEL_TOKEN` | **Hard stop if missing.** Without it nothing can reach the quiz. |
| `PUBLIC_URL` | The hostname you mapped, exactly as a phone should open it — this is what the QR encodes. |
| `ADMIN_PASSWORD` | **Hard stop if missing** (unless Cloudflare Access is configured). Without it you cannot open the host screen. `openssl rand -base64 24` |

It then validates the compose file, builds with `--pull`, waits for the container
to report healthy, **checks the tunnel container is running and has registered a
connection**, and prints the build it just deployed. Any of those failing exits
non-zero with the relevant logs rather than claiming success.

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
| `./scripts/local.sh version` | is the container running your current code? |
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

## Deploying a change that actually reaches the browser

Cloudflare puts a **four-hour browser cache TTL** on static assets by default. After
a deploy, a returning browser keeps running the old `app.js` for hours without even
asking — which looks exactly like the fix not working, and cost real time here.

So the HTML is served uncached and every local script and stylesheet reference is
rewritten to `?v=<build sha>`:

```html
<script src="/app.js?v=b22d4ff"></script>
```

The URL changes on every build, so the long cache becomes a benefit instead of a
trap, and no hard refresh is needed after a deploy.

## Which build am I running?

Every image is stamped with the commit it was built from, so "did my change
actually deploy?" is never a guess:

```bash
./scripts/local.sh version
# working tree : a086ec4
# container    : 9723b6d
# => BEHIND. The container is not running your current code:
#    ./scripts/local.sh
```

It is also on `/healthz`, in the server's startup log, and in small print at the
bottom of the host screen. **`public/` is baked into the image**, so any change to
the player or host pages needs a rebuild — `./scripts/local.sh` does that.

## Up but unreachable

The commonest cause by a distance: the connector is healthy and no DNS record
exists, because a **Public Hostname** was never added to the tunnel. A healthy
connector only means cloudflared is talking to Cloudflare — it routes nothing by
itself.

```bash
./scripts/doctor.sh
# --- does the public hostname resolve? ---
# quiz.fooxy.tv -> NO DNS RECORD
#    Add it in Zero Trust > Networks > Tunnels > your tunnel >
#    Public Hostname > Add a public hostname:
#        Type HTTP     URL quiz:3000
```

`doctor.sh` resolves `PUBLIC_URL`, probes the app from inside its own container,
checks the tunnel has registered a connection, looks for origin-unreachable errors
in its log, and prints both logs. It never prints secrets — tokens and passwords
show only as "set (N chars)".

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

**1. Tunnel.** In Zero Trust → Networks → Tunnels, create a tunnel and copy its
token into `TUNNEL_TOKEN`.

A connector showing "healthy" is only half the job — it says cloudflared is
talking to Cloudflare, not that anything knows where to send requests. On the
tunnel's **Public Hostname** tab, add one:

| | |
|---|---|
| Subdomain | `quiz` |
| Domain | `fooxy.tv` |
| Path | leave blank |
| Type | `HTTP` |
| URL | **`quiz:3000`** |

`quiz:3000`, not `localhost:3000`. `cloudflared` runs in its own container, so
`localhost` there is the connector itself; `quiz` is the compose service name,
which Docker resolves over the shared network, and 3000 is the container's own
port. The app publishes nothing to the host, so the tunnel is the only way in.
Cloudflare creates the DNS record for you when you add the hostname.

**2. Host password.** Set `ADMIN_PASSWORD` in `.env`. That is all the host screen
needs — see below.

## The host screen is password-protected

The quiz is open to anyone with the link. `/admin` is not: it serves a login form,
and the password is exchanged once for a signed, httpOnly session cookie lasting
`ADMIN_SESSION_DAYS` (14 by default).

On a public hostname that password is the only thing in front of the host screen,
so it is built accordingly:

- the comparison is constant-time over hashes, so it leaks nothing by timing;
- the cookie carries an HMAC over the expiry, signed with a random secret
  persisted server-side — it contains no part of the password, and tampering or
  forging it is refused;
- changing `ADMIN_PASSWORD` invalidates every existing session, because the
  signature is bound to it;
- five wrong guesses from one address triggers a lockout that doubles each further
  attempt up to an hour, and the lockout applies to the correct password too;
- with nothing configured the screen is **sealed**, not open — players can still
  play, and the startup log says so in a banner.

There is a **Sign out** button on the host screen for a shared machine.

### If the password will not work

Three things cause this, none of them the password being "wrong":

**The value got mangled by `.env`.** A `#` truncates it from that point, a `$` can
be expanded, quotes may be kept or stripped, and trailing spaces survive. The
server prints the length it actually received at startup — compare it with what you
typed:

```bash
docker compose logs quiz | grep "admin auth"
#   admin auth   password  (password is 8 characters as received)
#   !! The password this process received looks mangled:
#      - contains '#', which .env may treat as a comment
```

Generate one that cannot be mangled: `openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24`

**The container has not read it.** The process reads the environment once, at
start. After editing `.env`: `docker compose up -d` (or `docker compose restart quiz`).

**You are locked out.** Five wrong tries from your address starts a timeout that
doubles up to five minutes, and **it applies to the correct password too** — so
once you are locked, the right password is refused as well. The page says so
("Too many attempts. Try again in Ns."). Fifteen quiet minutes clears the slate,
or `docker compose restart quiz` does it immediately.

**The page did not change when you pressed the button.** Fixed: both the login
form and the host screen live at `/admin`, so a browser holding the cached login
page would ask "has it changed?" and be answered `304 Not Modified` — then
re-render the *login* page even though the server would have sent the host screen.
A manual refresh worked because it skips that conditional request. The host page
now sends no `Last-Modified` or `ETag` at all, so it can never be answered 304.

**You are on `/admin.html` rather than `/admin`.** Both filenames now redirect to
`/admin`; before, the static middleware served the host shell straight out with no
check, so it looked like a host screen that did not work instead of a login form.

`npm run test:auth` boots a throwaway server with a known password and checks all
of the above, including that the websocket refuses an unauthenticated upgrade and
that the player pages stay open.

Cloudflare Access is still supported as an alternative if you run Zero Trust, but
it is not needed and not on every plan.

## Cloudflare setup (Zero Trust alternative)

Only if you would rather use Zero Trust than a password. Add a self-hosted
application in Zero Trust → Access → Applications:

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
2. People scan the QR, type a name, and land in the lobby. **Show QR** (or the
   **Q** key) throws it full screen from either tab, for latecomers. Names appear as they
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
8. **Reset and kick everyone** is a clean slate: the board, the removed list and
   everyone's session all go, and each player has to join again from scratch.
   Within a round a removal sticks; *Let back in* or *Clear the list* undoes one
   without resetting.

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
| `POST /api/reveal` | take one more letter, paid for in time |
| `POST /api/bighint` | the shape of the word, free |
| `POST /api/skip` | give the word up, spending one skip |
| `WS /ws` | round and removal events |
| `GET /api/admin/board` | full leaderboard |
| `POST /api/admin/start` | `{countdownMs}` → leaves the lobby on a shared instant |
| `POST /api/admin/count` | `{count}` → questions per round, lobby only |
| `POST /api/admin/limit` | `{limitMs}` up to five minutes |
| `POST /api/admin/skips` | `{skips}` 0&ndash;5 per player |
| `POST /api/admin/help` | `{help}` `off` / `helpful` / `generous` |
| `POST /api/admin/reset` | new round, board wiped |
| `POST /api/admin/kick` / `unkick` | `{playerId}` |
| `POST /api/admin/clear-removed` | empty the removed list without resetting |
| `GET` / `PUT /api/admin/words` | read and replace the word list |
| `GET /api/theme` | the active theme (public; every page needs it to paint) |
| `GET /api/admin/themes` | every theme, and which is live |
| `POST /api/admin/theme` | `{id}` → switch for everyone at once |
| `WS /ws/admin` | live leaderboard stream |

## Tests

```bash
./scripts/local.sh && ./scripts/local.sh test   # the game, in Docker
npm run test:auth                               # the host login, on its own server
```

It also fetches `app.js`, `admin.js` and `sound.js` and asserts each feature is
actually *referenced*, not merely defined — the lifeline buttons once shipped as
dead code because an edit matched a stale string, and nothing caught it.

The suite drives a real server against the real local database, so it clears the
removed list, resets the round and asserts it left nothing behind — no stray
players, no removals, no half-finished round. That cleanup runs even if a check
throws, which is how residue got left the first time.

Or without Docker: `npm run dev` in one terminal, `npm test` in another.

A hundred and thirty-four checks against a live server (`test/smoke.mjs`), driving two players at
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
