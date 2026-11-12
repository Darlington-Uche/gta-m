# GTA Market

GTA-inspired art marketplace (devnet / play money). Static site — no build step, deployed on Vercel from `main`.

- `index.html` + `css/app.css` + `js/*.js` (ES modules, hash router)
- `js/config.js` — Supabase URL + publishable key. The site talks straight to Supabase (tables `m_*`, RPC functions `m_*`, storage bucket `m-art`); there is no separate backend.
- `js/data.js` — the artwork catalog; seeds the database on first load and via Admin → Dashboard → Sync catalog.
- `assets/` — artwork images.
- Admin: `#/admin` (password is checked inside the database).
