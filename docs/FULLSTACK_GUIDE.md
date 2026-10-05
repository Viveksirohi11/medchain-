# Full-stack guide (for interns)

You now have **three layers**. Each one only talks to its neighbour.

```
 React app (frontend/)  ──HTTP /api──►  Express API (backend/)  ──ethers.js──►  Smart contract (contracts/)
   what users see                        business logic + search                  the source of truth
                                         + off-chain "database"
```

## Why do we need a backend at all?
| Job | Why it is not done in the browser or on-chain |
|---|---|
| **Search** | Blockchains cannot answer "list all paracetamol batches expiring soon". The backend reads contract **events** into memory (`indexer.js`) and searches that copy (`search.js`). |
| **Readable details** | On-chain we only keep a *hash* of the metadata. The real text (drug name, strength…) lives in `backend/data/store.json`. The API re-hashes it and shows ✔ if it matches the chain (`metadataVerified`). |
| **Serials + Merkle proofs** | Built with `src/lib/merkle.js`, the same logic as the contract. |
| **Signing (demo only)** | `DEMO_MODE=true` lets the server send transactions from Hardhat's test accounts, so you can click through the whole story without MetaMask. |

## Where to find things
```
backend/src/
  server.js    start Express
  routes.js    every API endpoint (read it top to bottom, it is short)
  chain.js     connect to the node, load the contract, friendly error messages
  indexer.js   events -> in-memory batches/actors/alerts
  search.js    ADVANCED SEARCH (pure functions + unit tests in backend/test)
  store.js     JSON file for off-chain data
backend/scripts/seed.js   deploys the contract + creates demo data
frontend/src/
  pages/       Dashboard, Verify, Batches (search UI), BatchDetail, CreateBatch
  api.js       fetch wrapper      actor.jsx  "Acting as" demo login
```

## Advanced search
Type in the box, or open **Advanced filters**. All words must match (AND), case-insensitive.

| You type | Meaning |
|---|---|
| `paracetamol` | the word appears in drug, manufacturer, holder, notes… |
| `drug:amox` | drug name or strength contains "amox" |
| `mfr:kaveri`, `holder:"CityCare Pharmacy"` | manufacturer / current holder (name or address) |
| `status:recalled` | `active`, `recalled` or `expired` |
| `form:tablet` | dosage form |
| `expiring:30` | active batches expiring within 30 days |
| `flagged:true` | batches that had a cloned-pack alert |
| `id:5` | one batch |

Extra filters (form fields): expiry date range, % sold min/max. Sorting: best match, expiry, drug, % sold, alerts. Results are paginated and the status tabs show live counts. Everything is in the URL, so a search can be shared.

API example: `GET /api/batches?q=drug:paracetamol status:active&expiringInDays=60&sort=expiry&order=asc&page=1&limit=10`

## API reference
| Method & path | Purpose |
|---|---|
| `GET /api/health` | is the API connected to the chain? |
| `GET /api/stats` | dashboard numbers |
| `GET /api/batches` | **advanced search** (params above + `mfr holder form status expiresFrom expiresTo expiringInDays minDispensedPct maxDispensedPct flagged sort order page limit`) |
| `GET /api/batches/:id` | one batch with its full history |
| `GET /api/actors` | licensed actors (+ regulator) |
| `GET /api/alerts` | cloned-pack alerts |
| `POST /api/verify` | `{ payload }` (QR JSON) or `{ batchId, serial, proof }` → `Genuine / AlreadyDispensed / Recalled / Expired / Invalid / UnknownBatch` |
| `POST /api/batches` *(demo)* | register a batch |
| `POST /api/batches/:id/transfer` *(demo)* | `{ from, to }` |
| `POST /api/batches/:id/dispense` *(demo)* | `{ pharmacy, serial }` |
| `POST /api/batches/:id/recall` *(demo)* | `{ by, reason }` |
| `GET /api/batches/:id/units` *(demo)* | packs + ready-made QR payloads |

## Try this story in the UI (5 minutes)
1. **Dashboard**: see the clone alert on batch #1.
2. **Search batches**: type `drug:para`, then `expiring:30`, then tick "Only batches with clone alerts".
3. **Acting as → Aarav Pharma** → **New batch** → create "Ibuprofen 400 mg".
4. On the batch page, **transfer** to Meridian Distributors. Switch to **Meridian** and transfer to **CityCare Pharmacy**.
5. Switch to **CityCare**, press **Sell** on a pack. Press **Copy QR**, open **Verify a pack**, paste: now it says *Already sold*.
6. Switch to **State Drug Regulator**, **Recall** the batch, verify again: *Recalled*.

## Good first tasks
1. Add a "medicine name" autocomplete to the search box (`GET /api/batches/suggest?q=`).
2. Add a CSV export button for search results.
3. Add Hindi labels for the verify result.
4. Replace the JSON file in `store.js` with SQLite (`better-sqlite3`).
5. Add a `backend/test/` test for `parseQuery` with quoted values and unknown fields.
6. Real login: replace "Acting as" with MetaMask (`ethers.BrowserProvider`) so users sign their own transactions, then delete `DEMO_MODE`.

## Limits you must know
- Demo mode signs for everyone, so **there is no real authentication**. Never expose it to the internet.
- Serials and trees are stored in plain JSON, and the units endpoint exposes them. A real system encrypts them and never lists them.
- The contract has not been audited (see `SECURITY.md`).
- Re-run `npm run seed` after restarting `npm run chain`; the API detects the new deployment by itself.
