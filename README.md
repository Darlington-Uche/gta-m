# GTA Marketplace — Frontend

Static, framework-free frontend (HTML / CSS / vanilla JS). No build step, no backend.

## Run
Open `index.html`, or serve the folder: `npx serve .` / `python3 -m http.server`.

## Pages
- `index.html` Home · `explore.html` Explore · `auctions.html` Live auctions
- `collections.html` Collections · `artwork.html?id=N` Artwork detail (bid / buy) · `create.html` Create & Submit

## Structure
- `js/data.js` mock catalog (40 artworks, 8 collections) — swap for API calls later
- `js/app.js` shared layout (top nav, floating glass bottom dock on mobile), cart, wallet modal, search, timers
- `js/shop.js`, `home.js`, `collections.js`, `artwork.js`, `create.js` per-page logic
- `assets/art` 40 generated SVG artworks · `assets/hero` banners · `assets/fonts` bundled fonts
- `tools/` generators (`node tools/gen-art.js && node tools/gen-data.js`) to regenerate art + data

Cart, likes, bids and wallet are stored in localStorage (demo only; wallet connection is simulated).
Artworks are original illustrations — swap `assets/art/*` with real images anytime.
