# GTA Marketplace API

> Generated from `src/routes/*.routes.js` — run `npm run docs` to refresh.

Base URL: `/` · JSON in/out · Auth: `Authorization: Bearer <jwt>` (from `/auth/verify`)
Every success response is `{ ok: true, ... }`; errors are `{ ok: false, error: { code, message } }`.

## The transaction pattern (mint, offers, accept, list, buy)

1. **Prepare** — call the action route (e.g. `POST /items/:id/mint`). You get `{ ptxId, txB64, expiresAt, ... }`.
2. **Sign** — the wallet signs `txB64` (it is already partially signed by the platform).
3. **Submit** — `POST /tx/submit { ptxId, signedTx }`. Returns `tx.status: "confirmed"` (or `"sent"` if the network is slow — poll `GET /tx/:ptxId`).

## Meta & public stats

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/health` | public | Liveness check |
| `GET` | `/meta` | public | Network, wallets, public settings, SOL price and bid window — call once on app load |
| `GET` | `/stats` | public | Platform-wide numbers for the home page |
| `GET` | `/collections` | public | One collection per game era with floor price, volume, owners |
| `GET` | `/activity` | public | Recent sales feed<br>**query:** limit? |
| `GET` | `/metadata/:id.json` | public | Metaplex-standard NFT metadata JSON (this URL is stored on-chain as the NFT uri) |

## Auth (wallet sign-in)

| Method | Path | Auth | What it does |
|---|---|---|---|
| `POST` | `/auth/nonce` | public | Step 1: get a message to sign<br>**body:** wallet |
| `POST` | `/auth/verify` | public | Step 2: send the wallet signature (base58 or base64) -> JWT. Send as "Authorization: Bearer <token>" afterwards.<br>**body:** wallet, nonce, signature |

## Artworks (browse + mint)

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/items` | public | Browse/filter/sort artworks. era/category/rarity accept comma-separated lists (era=vice,sa). status: unminted | minted | listed | free. hasOffers=true -> only NFTs with active offers.<br>**query:** era?, category?, rarity?, hasOffers?, owner?, q?, status?, minUsd?, maxUsd?, sort?, page?, limit? |
| `GET` | `/items/:id` | public | One artwork: price, owner, listing, top offer |
| `GET` | `/items/:id/offers` | public | Active offers on an artwork, highest first |
| `POST` | `/items/:id/like` | 🔑 user | Toggle like |
| `POST` | `/items/:id/mint` | 🔑 user | PREPARE a mint (free or paid, price set by admin). Returns an unsigned tx -> user signs -> POST /tx/submit. The NFT is created on-chain when it confirms. |

## Trading (offers, sale prices, transaction submit)

| Method | Path | Auth | What it does |
|---|---|---|---|
| `POST` | `/items/:id/offers` | 🔑 user | PREPARE an offer on any minted NFT (no listing needed). Amount in USD, charged in SOL at the current price into escrow. Returns unsigned payment tx.<br>**body:** usd |
| `DELETE` | `/offers/:id` | 🔑 user | Cancel my active offer (SOL is refunded from the vault) |
| `POST` | `/offers/:id/reject` | 🔑 user | Owner declines an offer (bidder is refunded) |
| `POST` | `/offers/:id/accept` | 🔑 user | PREPARE accepting an offer (owner only). One tx: NFT -> bidder, vault pays owner, owner pays the ~$0.30 fee to the dev wallet. Other offers are refunded after it confirms. |
| `POST` | `/items/:id/listing` | 🔑 user | PREPARE setting a sale price (owner only). The owner signs once to let the platform move the NFT when someone pays.<br>**body:** priceUsd |
| `PATCH` | `/items/:id/listing` | 🔑 user | Change the sale price<br>**body:** priceUsd |
| `DELETE` | `/items/:id/listing` | 🔑 user | Remove the sale price |
| `POST` | `/items/:id/buy` | 🔑 user | PREPARE buying a NFT at its owner-set sale price (atomic tx) |
| `POST` | `/tx/submit` | 🔑 user | FINISH any prepared action. Send { ptxId, signedTx } (server broadcasts) or { ptxId, signature } (you broadcast it yourself). Returns status: confirmed | sent.<br>**body:** ptxId, signedTx?, signature? |
| `GET` | `/tx/:id` | 🔑 user | Poll a transaction request (status: prepared | sent | confirmed | expired | failed) |

## My account

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/me` | 🔑 user | Who am I (+ unread notification count) |
| `PATCH` | `/me` | 🔑 user | Update display name / avatar<br>**body:** username?, avatar? |
| `GET` | `/me/nfts` | 🔑 user | NFTs I own (from the database; fast) |
| `POST` | `/me/nfts/sync` | 🔑 user | Re-check ownership on-chain (finds NFTs moved/received outside the site) and return what I own |
| `GET` | `/me/likes` | 🔑 user | IDs of artworks I liked |
| `GET` | `/me/offers/made` | 🔑 user | Offers I placed |
| `GET` | `/me/offers/received` | 🔑 user | Active offers on NFTs I own |
| `GET` | `/me/activity` | 🔑 user | My purchases and sales |
| `GET` | `/me/notifications` | 🔑 user | My notifications (offer received, accepted, refunded, sold, ...)<br>**query:** unread?, limit? |
| `POST` | `/me/notifications/read` | 🔑 user | Mark notifications read (omit ids = all)<br>**body:** ids? |
| `GET` | `/me/submissions` | 🔑 user | My artwork submissions and their review status |

## Create & Submit

| Method | Path | Auth | What it does |
|---|---|---|---|
| `POST` | `/submissions` | 🔑 user | Submit artwork for review. multipart/form-data: files (1-5; JPG/PNG/GIF/MP4, 50MB), title, description, era, category, tags (comma separated) |

## Admin (ADMIN_WALLETS only)

| Method | Path | Auth | What it does |
|---|---|---|---|
| `GET` | `/admin/stats` | 🛡 admin | Dashboard numbers |
| `GET` | `/admin/wallets` | 🛡 admin | Network + the platform wallets (vault = collection authority unless COLLECTION_AUTHORITY_SECRET_KEY is set) |
| `GET` | `/admin/collections` | 🛡 admin | Collection registry: id, name, on-chain address, status (pending | live | paused) |
| `PUT` | `/admin/collections/:id` | 🛡 admin | Register / update a collection. With address: it is verified on-chain (must be a Core collection whose update authority is the platform authority) and set live. status pending|live|paused can be set alone.<br>**body:** name?, blurb?, address?, status? |
| `DELETE` | `/admin/collections/:id/address` | 🛡 admin | Detach a collection address (sets it back to pending; minted NFTs keep their own recorded collection) |
| `GET` | `/admin/items` | 🛡 admin | All items including hidden<br>**query:** status? |
| `POST` | `/admin/items` | 🛡 admin | Create an artwork in the collection (unminted). priceUsd 0 = free mint.<br>**body:** id?, collectionId?, artist?, title, description?, image, era, category, rarity?, tags?, priceUsd, hidden? |
| `PATCH` | `/admin/items/:id` | 🛡 admin | Edit an artwork / change its mint price (price only applies while unminted)<br>**body:** title?, description?, image?, era?, category?, rarity?, tags?, priceUsd?, hidden? |
| `POST` | `/admin/items/bulk-price` | 🛡 admin | Change many mint prices at once. mode: set | percent | add. Example: raise all Epic items 10% -> {filter:{rarity:"Epic"},mode:"percent",value:10}<br>**body:** ids?, filter?, mode, value |
| `GET` | `/admin/submissions` | 🛡 admin | Review queue<br>**query:** status? |
| `POST` | `/admin/submissions/:id/approve` | 🛡 admin | Approve -> creates an unminted artwork at the price you set<br>**body:** priceUsd, rarity?, itemId? |
| `POST` | `/admin/submissions/:id/reject` | 🛡 admin | Reject with a reason<br>**body:** reason? |
| `GET` | `/admin/vault` | 🛡 admin | Vault balance vs. what belongs to bidders (escrow) vs. platform revenue. Check `solvent` and `unexplainedLamports`. |
| `POST` | `/admin/vault/withdraw` | 🛡 admin | Queue a revenue withdrawal (can never touch bidders' escrow). Use this wallet to buy/sell the project token.<br>**body:** to, lamports |
| `GET` | `/admin/ledger` | 🛡 admin | Latest money movements<br>**query:** limit? |
| `GET` | `/admin/payouts` | 🛡 admin | Refund / withdrawal queue<br>**query:** status? |
| `POST` | `/admin/payouts/:id/retry` | 🛡 admin | Re-queue a payout stuck in needs_review (only after checking the explorer that it really did not land) |
| `GET` | `/admin/sales` | 🛡 admin | All sales |
| `GET` | `/admin/settings` | 🛡 admin | Runtime settings (fees, kill switches, bid window...) |
| `PUT` | `/admin/settings` | 🛡 admin | Change settings live. Send only the fields to change.<br>**body:** mintingEnabled?, tradingEnabled?, saleFeeBps?, acceptFeeUsd?, minOfferUsd?, maxActiveOffersPerItem?, offerTtlHours?, maxFreeMintsPerWallet?, bidWindow?, vaultReserveLamports? |
| `POST` | `/admin/jobs/run` | 🛡 admin | Run background jobs now (payouts, tx reconcile, offer expiry, ownership sync) |
| `POST` | `/admin/ownership/reconcile` | 🛡 admin | Re-check on-chain owners for the whole collection |
| `POST` | `/jobs/run` | ⏱ cron | Same as /admin/jobs/run but for an external scheduler. Header: x-cron-secret |

## Dev helpers (mock chain only)

| Method | Path | Auth | What it does |
|---|---|---|---|
| `POST` | `/dev/login` | public | Mock chain only: get a JWT for any wallet address without signing, and fund it with test SOL<br>**body:** wallet, fundSol? |
| `POST` | `/dev/sign` | public | Mock chain only: sign a prepared mock transaction as this wallet (stands in for Phantom)<br>**body:** txB64, wallet |

