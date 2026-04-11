# Deploy the game + multiplayer

GitHub **Pages cannot run** `server.js` (no Node, no WebSockets). The setup people often remember is **one URL** that serves both the React app and the WebSocket server—that is supported here.

---

## Fast path — Render Blueprint (this repo)

1. Sign in at [render.com](https://render.com) (GitHub login is fine).
2. **New** → **Blueprint** → connect **`shreyaanshp1/ColorGame`** (or your fork).
3. Render reads **`render.yaml`**, creates a **Web Service** named `color-game`, builds with `VITE_BASE_PATH=/`, starts with `npm start`.
4. When the deploy is **Live**, open the `https://…onrender.com` URL — that single link is the whole game + multiplayer (`wss://` same host).

If the build fails on Render, open the deploy logs. A common issue was **`NODE_ENV=production` during `npm ci`**, which skips **devDependencies** (no Vite). The Blueprint uses **`NPM_CONFIG_PRODUCTION=false npm ci`** and does **not** set `NODE_ENV` in `envVars` so installs stay reliable; **`SERVE_STATIC=1`** still turns on serving `dist/` at runtime.

---

## Option A — One host (manual; same as Blueprint, by hand)

Deploy **this repo** as a single **Node Web Service** (e.g. [Render](https://render.com), Railway, Fly.io).

1. **Build command** (must produce `dist/` before start). If your host sets `NODE_ENV=production` during build, use:
   ```bash
   NPM_CONFIG_PRODUCTION=false npm ci && VITE_BASE_PATH=/ npm run build
   ```
2. **Start command**:
   ```bash
   npm start
   ```
3. **Environment variables** (dashboard on your host):
   - `SERVE_STATIC` = `1` so `server.js` serves `dist/` (recommended on Render instead of relying on `NODE_ENV` alone).
   - Optional: `NODE_VERSION` = `22.12.0` (or another 20+).
   - `VITE_BASE_PATH` = `/` is applied in the **build** command; set it at runtime too only if it must match (usually not for root deploys).

What this does:

- `VITE_BASE_PATH=/` makes Vite build with asset paths at the **site root** (not `/ColorGame/`).
- `SERVE_STATIC=1` (or `NODE_ENV=production`) makes `server.js` serve `dist/` and WebSockets on the **same port**.
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
VITE_BASE_PATH=/ SERVE_STATIC=1 npm start
```

Then open `http://localhost:8080` (WebSocket is same host/port).

For day-to-day dev, keep using **`npm run dev`** (Vite + server on 8080).

---

## Why two base paths?

| Target | `VITE_BASE_PATH` | Why |
|--------|------------------|-----|
| `username.github.io/ColorGame/` | *(omit)* → `/ColorGame/` | Matches GitHub Pages project URL |
| Render / custom domain root | `/` | App lives at `https://yourapp.com/` |
