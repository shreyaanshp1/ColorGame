# Deploy the game + multiplayer

GitHub **Pages cannot run** `server.js` (no Node, no WebSockets). The setup people often remember is **one URL** that serves both the React app and the WebSocket server—that is supported here.

---

## Fast path — Render Blueprint (this repo)

1. Sign in at [render.com](https://render.com) (GitHub login is fine).
2. **New** → **Blueprint** → connect **`shreyaanshp1/ColorGame`** (or your fork).
3. Render reads **`render.yaml`**, creates a **Web Service** named `color-game`, builds with `VITE_BASE_PATH=/`, starts with `npm start`.
4. When the deploy is **Live**, open the `https://…onrender.com` URL — that single link is the whole game + multiplayer (`wss://` same host).

If the build fails, check the deploy logs; `npm ci --include=dev` keeps Vite available during the build even when `NODE_ENV=production` is set for runtime.

---

## Option A — One host (manual; same as Blueprint, by hand)

Deploy **this repo** as a single **Node Web Service** (e.g. [Render](https://render.com), Railway, Fly.io).

1. **Build command** (must produce `dist/` before start):
   ```bash
   npm ci && VITE_BASE_PATH=/ npm run build
   ```
2. **Start command**:
   ```bash
   npm start
   ```
3. **Environment variables** (dashboard on your host):
   - `NODE_ENV` = `production` **or** `SERVE_STATIC` = `1` — required so Node serves the `dist/` folder (some hosts omit `NODE_ENV`; then set `SERVE_STATIC=1`).
   - `VITE_BASE_PATH` = `/` is already applied in the **build** command above; you do not need it at runtime unless you want the server to match a different base.

What this does:

- `VITE_BASE_PATH=/` makes Vite build with asset paths at the **site root** (not `/ColorGame/`).
- `NODE_ENV=production` makes `server.js` serve files from `dist/` and attach WebSockets on the **same port** as the HTTP server.
- The browser uses **`wss://` + same host** automatically (no `VITE_WS_URL` needed).

Open your service URL (e.g. `https://your-app.onrender.com`)—that is the only link you share.

**Health check:** `GET /health` → `ok`

---

## Option B — GitHub Pages + separate WebSocket server

Use this if you want the site on `github.io` and the game server elsewhere.

1. Deploy **only** `server.js` to Render (or similar), **start** `npm start`. You can use it **without** serving static (API-only).
2. Set GitHub Actions secret **`VITE_WS_URL`** = `wss://your-api.onrender.com` (same host as HTTPS, `wss` not `https`).
3. The Pages workflow builds with default **`/ColorGame/`** base and embeds `VITE_WS_URL` for multiplayer.

If `VITE_WS_URL` is missing, the app tries `wss://*.github.io`, which **will not work** until the secret is set.

---

## Local: full stack like production

```bash
npm run build
VITE_BASE_PATH=/ NODE_ENV=production npm start
```

Then open `http://localhost:8080` (WebSocket is same host/port).

For day-to-day dev, keep using **`npm run dev`** (Vite + server on 8080).

---

## Why two base paths?

| Target | `VITE_BASE_PATH` | Why |
|--------|------------------|-----|
| `username.github.io/ColorGame/` | *(omit)* → `/ColorGame/` | Matches GitHub Pages project URL |
| Render / custom domain root | `/` | App lives at `https://yourapp.com/` |
