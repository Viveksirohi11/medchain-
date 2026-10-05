# MedChain: Blockchain Anti-Counterfeit Medicine Traceability

Full-stack project (Solidity contract + Node/Express API + React web app) that lets a patient verify, in seconds and for free,
whether a medicine pack is genuine, already sold, recalled or expired.

## 1. The real-world problem

Counterfeit, spurious and "Not of Standard Quality" (NSQ) medicines are a documented public-health
and trust problem in India, the world's largest supplier of generic medicines by volume.
In June 2026 the Union Health Ministry expanded the QR-code track-and-trace mandate
beyond the top-300 brands to **vaccines, antimicrobials, anti-cancer and narcotic/psychotropic
drugs**, with phased deadlines in 2027-2028. Reporting also points to a real weak spot in
such systems: if a counterfeit is registered before the genuine product, the genuine pack can
look fake.

What goes wrong in a normal (centralised, paper or siloed-database) chain:

| Failure | Consequence |
|---|---|
| Records live in each company's private database | No shared truth; regulators reconcile manually |
| Anyone can print a QR code | Cloned genuine codes pass a naive scan |
| Genuine pack is registered late | A counterfeit "registered first" looks authentic |
| Recall notices travel by letter/WhatsApp | Recalled stock keeps being sold |
| Central operator can edit history | Trust depends on one party |

## 2. The solution

A shared, tamper-evident registry on an EVM chain:

1. **Regulator licenses actors** (manufacturer, distributor, pharmacy). Only licensed
   addresses can write, so a counterfeiter can never "register first".
2. **Manufacturer commits a batch with one Merkle root** of random 128-bit unit serials
   (constant storage cost, even for millions of packs). Serials are secret until printed.
3. **Custody chain** manufacturer -> distributor(s) -> pharmacy is enforced on-chain.
4. **Pharmacy dispenses** a unit by revealing serial + Merkle proof. The unit is burned.
5. **Cloned packs are caught**: a second scan returns `AlreadyDispensed` and the pharmacy attempt is
   logged as a `DuplicateScan` event (the contract logs rather than reverts, so evidence persists).
6. **Patients verify for free** through a `view` call (no gas, no wallet).
7. **Recall** by regulator or the batch's manufacturer flips every pack in the batch to `Recalled`
   instantly, even while the system is paused.

### Architecture

```
 Regulator ──licenses──►  MedChainRegistry (Solidity)  ◄──verifyUnit (free)── Patient app / inspector
                              ▲        ▲        ▲
         registerBatch(root)  │        │        │ dispense(serial, proof)
 Manufacturer ────────────────┘   Distributor ──► Pharmacy
              transferCustody ───────────►────────►

 Off-chain: serial generation, Merkle tree, QR printing, metadata (drug, lab report) on IPFS/DB
 On-chain : roles, Merkle root, custody, dispensed-flags, recall, events, hash of metadata
```

## 3. Project layout

```
medchain/
├── backend/                         # Express API: search, verify, demo actions (see docs/FULLSTACK_GUIDE.md)
├── frontend/                        # React (Vite) web app
├── contracts/MedChainRegistry.sol   # the system (roles, batches, custody, dispense, verify, recall)
├── scripts/
│   ├── lib/merkle.js                # serial generation + Merkle tree matching the contract
│   ├── deploy.js                    # deploy to any network
│   └── demo.js                      # end-to-end story on a local chain
├── test/MedChainRegistry.test.js    # 24 tests
├── docs/
│   ├── SECURITY.md                  # threat model, trade-offs, known limits
│   └── ROADMAP.md                   # what to build next (frontend, mobile, GS1, L2)
├── hardhat.config.js
├── package.json
└── .env.example
```

## 4. Quick start

```bash
npm install
npm test            # 24 tests
npm run demo        # end-to-end story
cp .env.example .env   # fill in a throwaway key + RPC URL
npm run deploy:sepolia
```

Requires Node 18+ (20 recommended). `npm test` and `npm run demo` run on Hardhat's in-process
chain; no wallet or internet-based chain needed (Hardhat downloads the Solidity compiler on first run).

## 4b. Run the full stack (web app)

Needs Node 18+. Use **3 terminals** from the project root:

```bash
npm run setup      # once: installs root, backend and frontend dependencies
npm run compile    # once: builds the contract artifacts

npm run chain      # terminal 1: local blockchain (keep running)
npm run seed       # terminal 2: deploy contract + demo data (re-run after restarting the chain)
npm run backend    # terminal 2 (after seed): API on http://localhost:4000
npm run frontend   # terminal 3: web app on http://localhost:5173
```

Open http://localhost:5173. Full explanation, API list, **advanced search syntax** and intern exercises:
[`docs/FULLSTACK_GUIDE.md`](docs/FULLSTACK_GUIDE.md). Backend search tests: `npm run test:backend`.

## 5. Contract API

| Function | Who | Purpose |
|---|---|---|
| `licenseActor(actor, role, licenseId)` | Regulator | Grant manufacturer/distributor/pharmacy role, store licence hash |
| `revokeActor(actor, role)` | Regulator | Remove a role |
| `registerBatch(root, metadataHash, expiresAt, quantity)` | Manufacturer | Commit a batch |
| `transferCustody(batchId, to)` | Current custodian | Move batch down the chain |
| `dispense(batchId, serial, proof)` | Pharmacy holding the batch | Sell a unit (burn); logs clones |
| `verifyUnit(batchId, serial, proof)` | Anyone (view) | `Genuine / AlreadyDispensed / Recalled / Expired / Invalid / UnknownBatch` |
| `recallBatch(batchId, reasonHash)` | Regulator or batch manufacturer | Recall |
| `pause()` / `unpause()` | Regulator | Emergency stop for writes (recall still works) |

### Suggested QR payload

`{ "b": <batchId>, "s": "MC-XXXXXXXX-...", "p": ["0x..", "0x.."] }`
(a proof is about log2(units) hashes, so around 20 hashes for a million-unit batch).

## 6. Testing status

All 24 tests pass (licensing, registration, custody rules, dispensing, clone detection, forged serials,
expiry, recall, pause, and a 137-serial Merkle correctness sweep). See `docs/SECURITY.md` for what the
tests do **not** cover. A professional audit is required before any real deployment.
