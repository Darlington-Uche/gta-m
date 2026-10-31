# Frontend -> backend

1. Edit `js/config.js`: `API_URL: 'https://your-api.up.railway.app'` (no trailing slash). Empty = demo mode (static data.js; wallet/mint disabled).
2. Host the same `assets/` images publicly and set the backend's `ASSETS_BASE_URL` to that site (GitHub Pages works).
3. Backend `CORS_ORIGINS` should include your frontend origin.
4. Wallets: Phantom / Solflare / Backpack. Against the mock backend, Alice/Bob/Carol test wallets appear.
5. Pages: Explore, Offers (minted NFTs with live offers), Collections, Artwork (mint / offer / sale price / buy / accept), Create (submit art for review), Profile (NFTs, offers, notifications, activity).
