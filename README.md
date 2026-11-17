# 🎤 Ondu Karaoke

A party karaoke web app with two screens:

- **Host screen** (`/host`) — runs on the TV or laptop. Big YouTube player, a QR
  code that is always visible, the shared queue and a live leaderboard.
- **Phone controller** (`/join/:roomCode`) — guests join by scanning the QR
  code (or typing the 4-letter room code), queue songs, send reactions,
  applaud and blow an airhorn.

Everything is real-time via Socket.IO, the neon theme is pure CSS, and the
YouTube Data API key never leaves the server.

---

## ✨ Features

| | |
|---|---|
| 🎶 **Shared queue** | One queue for the whole room, synced live to every phone and the TV. |
| 🔀 **Host controls** | The host reorders (▲ ▼) and removes (✕) songs right on the TV — and the host's phone gets the same controls in its Queue tab, plus ⏭ to skip. |
| 🔄 **Fair rotation** | Everyone's first song plays before anyone's second — one guest cannot hog the mic. |
| 📝 **Synced lyrics** | A **Video / Lyrics** toggle on the TV. The words are big, and the line being sung grows and glows. Free via LRCLIB — no API key. |
| 🧑‍🎤 **Singer names** | Every queue entry shows who is singing it, on the TV and on every phone. |
| 🔑 **Host password** | Every room gets a 6-digit password, shown on the TV. Type it to get back in — from another device, after a refresh, or after pressing *back*. |
| 💾 **6-hour sessions** | The host screen and every phone remember their room for 6 hours, so closing the tab (or the app) is not fatal. |
| 📤 **Share** | One tap copies the join link, or opens the system share sheet (WhatsApp, Messages, AirDrop…). |
| 🎲 **Random song** | Pick English / Hindi / Kannada and a popular karaoke track is queued under your name. |
| 💜 **Live reactions** | ❤️ 🔥 👏 😂 🎤 🎉 float up the TV screen and count towards the singer's score. |
| 👏📢 **Applause & airhorn** | Synthesised with the Web Audio API (no audio files) — with a 2s anti-spam cooldown. |
| ⏭ **Intermission** | Fullscreen "Get ready, <singer>!" with an animated 5-second countdown, then the next song. |
| 🎊 **Confetti** | A burst when a song ends and a big one for the night summary (canvas-confetti). |
| 🏆 **Night summary** | Badges — *Most Songs*, *Crowd Favorite*, *Hype Master* — plus the final ranking. |
| ⚡ **Speed control** | *Hidden for now* — 0.75x…1.25x is still supported by the backend, flip `SHOW_SPEED` in `client/src/pages/HostPage.jsx` to bring the chips back. |
| 📺 **Fullscreen** | One button, neon-friendly, made for a TV. |

### Getting back into your room

Losing the room is the classic party-killer, so there are three ways back in:

1. **Nothing to do** — the host screen and every phone keep their session for
   **6 hours** in `localStorage`. Press *back*, close the tab, lock the phone,
   come back hours later: you are still in the room, with the same name and
   score.
2. **The host password** — every room gets a 6-digit password, displayed on the
   TV (with a *copy* button). On the landing screen the host can pick
   *“I already have a room”* and type the code + password. Guests can do the
   same from the join screen (*“I am the host”*) to get the host controls on
   their phone.
3. **The host-remote QR** — a second QR code on the TV that turns a phone into
   the host remote: the phone's *Queue* tab then grows ▲ ▼ ✕ (reorder, remove)
   and a ⏭ on the song that is playing.


> **Heads-up:** embedded YouTube may show ads before or during a video. That is
> expected — we deliberately do not try to block or strip them.

### Video / Lyrics on the TV

The stage has two tabs: **🎬 Video** (the normal YouTube player) and **📝 Lyrics**
(big words). Switching tabs never stops the song — the player stays mounted
behind the lyrics panel.

Lyrics are looked up once per song from [LRCLIB](https://lrclib.net/) (free, no
key) and cached for 24 hours. Karaoke-upload suffixes such as
`(Karaoke Version) [HD Lyrics]` are stripped before searching, and the best
match prefers complete, time-synced lyrics by the original artist.

Karaoke videos often have a long title card, so the words can drift a little.
Use the **−½s / +½s** buttons in the lyrics header until the big line matches
the singer; the offset resets for each song. If only plain lyrics exist they are
shown without highlighting. If a song has no lyrics at all, the TV says so and
quietly switches back to the video after 3 seconds (a service error does not —
that keeps the *Try again* button).

Next to the tabs you still see what is playing now; along the bottom of the
stage a new card shows **UP NEXT** — the title and who is singing it.

---

## 🏗️ Architecture

```
┌──────────────── TV / laptop ────────────────┐        ┌──── phone ────┐
│  /host                                      │        │ /join/CODE   │
│  ┌────────┬───────────────┬──────────────┐  │        │ Search Queue  │
│  │ QR +   │  YouTube      │ Queue        │  │        │ React Random  │
│  │ room   │  IFrame player│ Leaderboard  │  │        └───────┬──────┘
│  │ code   │               │              │  │                │
│  └────────┴───────────────┴──────────────┘  │                │
└───────────────────┬────────────────────────┘                │
                    │   Socket.IO (rooms, queue, reactions)    │
                    ▼                                        │
        ┌───────────────────────────────────┐                 │
        │ Express + Socket.IO  (server/)    │◀────────────────┘
        │ • rooms live in memory             │
        │ • YouTube Data API v3 (key hidden) │
        │ • REST: /api/search, /api/lan-url │
        └───────────────────────────────────┘
```

* **Two interchangeable backends, one set of rules**
  * `server/` — Express + Socket.IO. Rooms live in a `Map`. Simple, and the
    default for local development.
  * `worker/` — Cloudflare Worker + Durable Objects (one object per room).
    This is the deployment target: the app, the API and the real-time layer
    all in one Worker.
  * Both use `shared/room.js` + `shared/commands.js`, so the queue rotation,
    the permissions and the scoring are implemented exactly once.
* **Frontend** — React (Vite). Two routes: `/host` and `/join/:roomCode`.
  The realtime layer is pluggable (`client/src/lib/realtime.js`): Socket.IO
  for the Node backend, a plain WebSocket for the Worker.
* **Real-time model** — the backend owns the truth and broadcasts one
  `room:state` snapshot after every change. Clients render from that
  snapshot, so a phone that refreshes (or a TV that reloads) instantly
  catches up.

### File structure

```
OnduKaraoke/
├── package.json              # dev/build/deploy scripts
├── .env.example              # YOUTUBE_API_KEY + PORT + CLIENT_ORIGIN
├── wrangler.jsonc            # Cloudflare Worker config (assets + Durable Objects)
├── render.yaml               # Render blueprint (Node backend, optional)
├── railway.toml              # Railway config (Node backend, optional)
├── Dockerfile                # one image: built frontend + Express/Socket.IO
├── shared/                   # ★ the rules — used by BOTH backends
│   ├── room.js               # room state, fair queue, stats, badges
│   ├── commands.js           # every command + who may run it
│   ├── youtube.js            # YouTube search + 24h cache (cache injected)
│   └── randomSongs.js        # language presets for the Random tab
├── server/                   # backend A — Express + Socket.IO (local dev / VPS)
│   ├── index.js              # REST + all socket events
│   ├── rooms.js              # the in-memory Map of rooms
│   ├── youtube.js            # injects the key + an in-memory cache
│   ├── scripts/smoke.mjs     # 28-check end-to-end test (npm run smoke)
│   └── package.json
├── worker/                   # backend B — Cloudflare Worker (the deployment)
│   ├── index.js              # Static Assets + REST + /ws routing
│   ├── room.js               # the Durable Object = one room
│   ├── youtube.js            # injects the key + the Cache API cache
│   ├── cache.js              # 24h cache on the Cache API
│   └── scripts/smoke.mjs     # 33-check end-to-end test (npm run smoke:worker)
└── client/
    ├── index.html
    ├── vite.config.js        # dev proxy → backend (/api, /socket.io, /ws)
    ├── .env.example          # VITE_REALTIME / VITE_BACKEND_URL / VITE_API_URL
    └── src/
        ├── App.jsx           # routes
        ├── styles/neon.css   # the whole neon theme
        ├── lib/              # realtime (socket.io | workers), session (6h),
        │                     #   sounds, config, confetti…
        ├── components/       # NeonTitle, QrPanel, YoutubePlayer, QueuePanel,
        │                     # Leaderboard, IntermissionOverlay, ReactionLayer,
        │                     # SummaryScreen, ToastDeck
        ├── components/controller/   # phone tabs: NameGate, Search, Queue, React, Random
        └── pages/            # HostPage.jsx, JoinPage.jsx
```

> **One set of rules, two backends.** `shared/room.js` and
> `shared/commands.js` contain the queue rotation, the permissions and the
> scoring. The Node server and the Durable Object are thin adapters around
> them, so a party behaves identically on both.

---

## 🚀 Setup

**Requirements:** Node.js 18+ (tested on 18/20/22) and a YouTube Data API v3 key.

### 1. Get a YouTube API key

1. Open <https://console.cloud.google.com/apis/credentials> and create an API key.
2. Enable the **YouTube Data API v3** for that key
   (*APIs & Services → Library → YouTube Data API v3 → Enable*).
3. Copy the key.

### 2. Configure

```bash
cp .env.example .env
# then edit .env and paste your key
YOUTUBE_API_KEY=your_youtube_api_key_here
PORT=3001
```

Without a key the app still runs — searching shows a friendly message
("Song search is not set up yet — the host needs to add YOUTUBE_API_KEY…").

### 3. Install

```bash
npm run setup     # installs server/ and client/ dependencies
```

### 4. Run it

**Party mode (recommended — one URL for TV and phones):**

```bash
npm run build     # builds the React app into client/dist
npm start         # Express serves the API *and* the built frontend on :3001
```

Open `http://<your-computer-ip>:3001/host` on the TV (the backend prints the
LAN URL hint) and press **Create a room** → **Start party**.

> The QR code points at your LAN address, so phones on the same Wi-Fi can scan
> it and join. If you open the host screen via `localhost`, the app asks the
> backend for the machine's LAN IP and uses that in the QR code instead.

**Development mode (hot reload):**

```bash
npm run dev       # backend on :3001 + Vite dev server on :5173
```

Use <http://localhost:5173/host> for the host screen. The Vite proxy keeps
`/api` and the websocket on the same origin.

**Cloudflare mode (the deployment — see the Deploying section):**

```bash
npm run dev:worker   # build + wrangler dev on :8787
```

---

## 🎉 How to use it at a party

1. **TV**: open `/host` → **Create a room** → a 4-letter code appears
   (e.g. `JXQA`) next to the QR code → press **Start party** (this one click
   also unlocks audio in the browser).
2. **Phones**: scan the QR code (or open `/join` and type the code) → enter a
   name → you are in.
3. Guests pick songs in **Search**, gamble in **Random**, hype the singer in
   **React**, and watch the queue in **Queue**.
4. The host can also scan the small **Host remote** QR with their phone to get
   *skip*, *reorder* and *speed* controls on the go.
5. Between songs the TV shows **"Get ready, <name>!"** with a 5-second
   countdown, and confetti fires when a song ends.
6. When the night is over, press **End party** → the **Night summary** with the
   three badges and the final ranking.

---

## 🧪 Test plan

### Automated (no YouTube key needed)

Two suites — one per backend — both drive a real server over websockets:

```bash
npm run smoke          # Node/Socket.IO backend (38 checks)
npm run smoke:worker   # Cloudflare Worker + Durable Objects (40 checks)
```

| Check | What it proves |
|---|---|
| lyrics parser | karaoke suffixes stripped, LRC timestamps parsed, current line found |
| lyrics endpoint | both backends return synced lines for a known song |
| host creates a room | 4-letter code, unique |
| guests join with a name | guestId + name issued |
| fair rotation | 3 songs by Asha + 1 by Ravi queue as A1, R1, A2, A3 |
| party start | phase → `intermission`, ~5s countdown, next song queued |
| song started | phase → `playing`, singer credited with the song |
| reactions | reach the host screen, count for singer *and* sender |
| sound cooldown | first sound OK, second one rejected |
| speed control | speed is shared with the whole room |
| reorder | host can move a song up/down |
| permissions | a guest cannot remove someone else's song |
| song end / skip | the next singer takes the mic, empty queue idles the party |
| reconnect | a phone rejoins with the same name and guestId |
| end of night | summary contains badges, leaderboard and totals |
| storage round-trip | the room reloads from Durable Object storage intact |

### Manual (party rehearsal)

1. **Host screen** — create a room; the QR code, room code, queue panel and
   leaderboard are visible; `Fullscreen` works; `Start party` is required once.
2. **Join** — scan the QR with two phones; both get the same room code and can
   see each other in the leaderboard.
2b. **Host password** — the TV shows a 6-digit password; copy it, press *back*
   on the TV, then use *"I already have a room"* with the code + password → you
   are back in the same room, with the queue intact.
2c. **Sessions** — reload the TV and a phone: both come back automatically
   (within 6 hours) with the same room/name.
2d. **Reorder** — on the TV, use ▲ ▼ in the queue: the order changes for every
   phone too.
2e. **Share** — *📤 Share* opens the system share sheet; *🔗 Copy link* copies
   the join URL.
3. **Search** — search a song; results show a thumbnail, title and channel;
   `＋ Add` queues it under your name; the TV queue updates instantly.
4. **Fair rotation** — A queues 3 songs, B queues 1 → the queue shows
   A, B, A, A (rounds), and B is not stuck behind A's third song.
5. **Remove** — you can remove your own song; another guest's song cannot be
   removed by you (host can remove anything).
6. **Intermission** — start the party; the fullscreen countdown reads
   "Get ready, <name>!" and the next song starts automatically.
7. **Confetti** — when a song ends, confetti bursts before the intermission.
8. **Reactions** — tap emojis on a phone; they float up the TV with random
   positions and fade out; the leaderboard and the singer's reaction count go up.
9. **Sounds** — applause and airhorn are audible on the TV; tapping twice in a
   row shows the 2s cooldown instead of spamming.
10. **Speed** — 0.75x…1.25x changes the playback rate on the TV (pitch/key
    cannot be changed in an embedded YouTube player — that is why only speed
    is offered).
11. **Bad video** — add a video that cannot be embedded; the host screen shows
    a warning and auto-skips to the next song.
12. **Reconnects** — refresh a phone → it rejoins with the same name and
    keeps its score; refresh the host screen → it reconnects to the same room
    and resumes the current song near the right position.
13. **End party** — the night summary shows the badges (Most Songs, Crowd
    Favorite, Hype Master) and the final ranking; "Start a new party" creates
    a fresh room.
14. **Quota** — with the daily quota exhausted, searching shows a friendly
    message instead of a crash; cached and random picks keep working.

---

## ☁️ Deploying (one service, Cloudflare)

Everything — the React app, the song search API and the real-time layer —
runs on **one Cloudflare Worker**:

```
┌───────────────────────── Cloudflare ─────────────────────────┐
│  ondu-karaoke.workers.dev                                  │
│                                                            │
│  /host  /join/:code  →  React app (Static Assets)           │
│  /api/search           →  YouTube search (key stays here)  │
│  /api/rooms            →  hands out a room code            │
│  /ws?room=CODE         →  Durable Object = one room        │
│                          (holds the phones + the queue)    │
└────────────────────────────────────────────────────────────┘
```

No second service, no cold starts, no WebSocket limitations.

### Why a Durable Object

Vercel Functions cannot hold WebSocket connections, so the real-time layer
needs a long-lived process. On Cloudflare that is a **Durable Object**: one
object per room (the 4-letter code), holding the phone/TV sockets, the queue
and the stats. It uses the WebSocket Hibernation API, so a room that nobody
is using costs nothing.

### Setup (5 minutes)

```bash
# 1. Install + build
npm run setup
npm run build:worker        # builds the client with the WebSocket transport

# 2. Log in to Cloudflare (opens a browser tab)
npx wrangler login

# 3. Create the Worker (first time only)
npx wrangler deploy
#    → prints: https://ondu-karaoke.<you>.workers.dev

# 4. Add the YouTube key as a secret (never in the bundle)
npx wrangler secret put YOUTUBE_API_KEY
#    paste the key → press enter

# 5. Deploy again so the secret takes effect
npm run deploy
```

Then open the worker URL on the TV, press **Create a room** → **Start party**.
Phones scan the QR and join through the same URL. Done — one service.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev:worker` | Build + run the Worker locally (wrangler dev, port 8787) |
| `npm run deploy` | Build the client for Workers + deploy |
| `npm run secret` | Add/update the `YOUTUBE_API_KEY` secret |
| `npm run smoke:worker` | 30-check end-to-end test against `wrangler dev` |
| `npx wrangler tail` | Live logs from the Worker |

### Local development against the Worker

```bash
# terminal 1 — the Worker (API + Durable Objects + assets)
npm run dev:worker

# terminal 2 — Vite with hot reload, proxying /api and /ws to the Worker
cd client && VITE_REALTIME=ws VITE_PROXY_TARGET=http://127.0.0.1:8787 npx vite
```

### Free-tier limits (verified in the Cloudflare docs)

| | Free plan |
|---|---|
| Worker requests | 100,000/day |
| CPU per request | 10 ms (network waits don't count) |
| Durable Object requests | 100,000/day |
| Durable Object duration | 13,000 GB-s/day ≈ 28 h of a 128 MB instance |
| WebSocket messages | billed 20:1 (100 messages = 5 requests); pings and outgoing messages are free |

A party (TV + 30 phones) costs roughly **50 requests** and ~1,800 GB-s of
object time — free with a ~1000× margin.

### Notes & limits

* **One replica per room** — a room is a Durable Object, so this is automatic.
* The room state is written to SQLite storage on every change, so a room
  survives the object being evicted from memory.
* The YouTube key is a **secret** (`wrangler secret put`), never a variable
  in `wrangler.jsonc` and never in the client bundle.
* YouTube ads are accepted as-is — we do not try to block them.
* If you want your own domain: add it to the Worker in the dashboard
  (*Settings → Domains & Routes*) and the QR code follows automatically.

<details>
<summary>Prefer a classic Node server?</summary>

The repo still contains the Express + Socket.IO backend (`server/`) — it is
the local-dev default and works on any host that supports WebSockets
(Render free, Railway, Fly.io, a VPS…). The **room rules are shared**: both
backends use `shared/room.js` and `shared/commands.js`, so the queue
rotation, permissions and scoring behave identically.

```bash
npm run build && npm start          # everything on one port
docker build -t ondu-karaoke .      # or as a container
```

`Dockerfile`, `render.yaml` and `railway.toml` are included for that path.
</details>

---

## 🔌 Technical notes

### YouTube search (server only)

* Every query silently gets **"karaoke"** appended (unless the user typed it).
* Parameters: `type=video`, `videoEmbeddable=true`, `videoCategoryId=10`
  (Music), `maxResults=12`.
* Results from **Sing King / KaraFun / Karaoke Version** are moved to the top
  when they exist.
* Results are cached **for 24 hours** so a room full of people searching the
  same song costs one quota unit, not twenty. The cache is injected per
  backend: an in-memory Map on Node, the **Cache API** on Cloudflare (so it is
  shared across users and data centres).
* Quota/permission errors are translated into friendly messages; the raw
  Google payloads never reach the phone.

### Playback state machine (server owned)

```
idle ──Start party──▶ intermission ──host starts the video──▶ playing
                          ▲                                      │
                          └──────── song ended / skipped / error ─┘
                                 (empty queue → idle)

party ended ──▶ summary (badges + final ranking)
```

The host screen tells the server when a song actually started or ended; the
server owns the queue, the stats and the countdown, so every device agrees.

### Fair rotation

Each queued song carries the **round** it belongs to (a singer's 1st song is
round 0, 2nd song round 1 …). A new song is inserted at the end of its round,
so the queue plays *everyone's first song, then everyone's second song*, and
the order never jumps around while people watch.

### Sounds

Applause and airhorn are **synthesised with the Web Audio API** — no audio
files, nothing to license. The `AudioContext` is unlocked by the host's
"Start party" click (browsers only allow sound after a user gesture) and each
guest gets a 2-second cooldown per sound.

---

## 🩺 Troubleshooting

| Symptom | Fix |
|---|---|
| "Song search is not set up yet" | Node: put `YOUTUBE_API_KEY` in `.env` and restart. Worker: `npx wrangler secret put YOUTUBE_API_KEY` and deploy again. |
| "The YouTube search quota is used up for today" | The free quota resets at midnight (Pacific). Cached searches and the Random tab still work. |
| Phones cannot open the join page | On the LAN use `http://<ip>:3001`; on Cloudflare use the worker URL. Both are printed/shown by the app. |
| No sound on the TV | Press **Start party** (that click unlocks audio) and check the TV volume. |
| A video will not play | Expected for some uploads — the host screen auto-skips to the next song. |
| The room vanished (Node backend) | Rooms live in memory: restarting the server clears them. On Cloudflare a room survives restarts (Durable Object storage). |
| The host screen lost the room after a reload | It should come back on its own (6-hour session). If not, use *"I already have a room"* with the code + 6-digit password. |
| The TV will not go fullscreen | Press <b>F</b> or click **⛶ Fullscreen**. iPhone/iPad Safari only allows fullscreen for video — use *Share → Add to Home Screen* there. |
| `wrangler dev` shows a port conflict | Something else uses :8787 — stop it or pass `--port 8789`. |
| The Worker build looks like the Node version | Deploy with `npm run deploy` (it builds with `VITE_REALTIME=ws`). |

---

## 📄 License

Do what you want with it. 🎉
