# Deploying Aradhana on Netlify

## ⚠️ Before you click "Deploy": the dependency chain

The website is **not** a plain static site — it is a Node full-stack app (server.js + SQLite + API).
Netlify can only serve `ui/` and proxy `/api/*` to a backend. So the correct order is:

1. **Render first**  — deploy the backend (free). `render.yaml` is already at the repo root.
   On first boot it restores ~740 rows from Supabase automatically (`scripts/rehydrate-from-supabase.js`).
2. **Then Netlify**   — serve the static UI and proxy `/api/*` → your Render service.

If you deploy Netlify without Render, the site loads but every API call fails (home page shows stale/offline data; sign-in won't work).

## Deploy on Netlify

1. Push this repo to GitHub (see commands below).
2. Netlify → Add new site → Import from Git → pick the repo.
   - Base directory: (repo root)
   - Build command: *(leave empty)*
   - Publish directory: `ui`
3. `netlify.toml` already contains:
   - `/api/*` → `https://aradhana.onrender.com/api/:splat` (rewrite/proxy → your Render backend)
   - `/uploads/*` → same backend
   - `/*` → `/index.html` (SPA fallback)
4. **Update the proxy URL** in `netlify.toml` if your Render service got a different subdomain
   (Render dashboard → service → Settings). Example: `https://aradhana-service.onrender.com/api/:splat`

## After deploy — mandatory

1. **Supabase → Authentication → URL Configuration**
   - Site URL = `https://<your-site>.netlify.app`
   - Redirect URLs += `https://<your-site>.netlify.app/**`
   (Otherwise signup/reset emails keep redirecting to localhost:3000 / fail.)
2. **Service worker** — new visitors get v13 automatically (app shell now network-first for HTML).
   No action needed.

## Files in the repo used by Netlify

- `netlify.toml` — proxy + SPA fallback + publish dir (`ui/`) — committed, do not delete
- `ui/` — the entire static frontend
- `_backups/` — old merge leftovers, excluded from git; Netlify never sees them

## Local build preview (optional, before pushing)

The site works unchanged locally at `http://localhost:4321` — Netlify serves the same files, just statically + proxy.
