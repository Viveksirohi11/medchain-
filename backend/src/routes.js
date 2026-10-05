const express = require("express");
const { ethers } = require("ethers");
const { DEMO_MODE } = require("./config");
const { provider, getContract, getDeployment, signerFor, explainError } = require("./chain");
const indexer = require("./indexer");
const store = require("./store");
const { searchBatches } = require("./search");
const { generateSerials, buildBatch } = require("./lib/merkle");

const router = express.Router();
const STATUS = ["UnknownBatch", "Invalid", "Genuine", "AlreadyDispensed", "Recalled", "Expired"];
const MESSAGES = {
  Genuine: "This pack is registered and has not been sold yet. It looks genuine.",
  AlreadyDispensed: "WARNING: this pack was already sold once. If you are buying it now, it may be a cloned copy.",
  Recalled: "DANGER: this batch was recalled. Do not use this medicine.",
  Expired: "This batch has expired. Do not use it.",
  Invalid: "WARNING: this serial is NOT part of the batch. The pack is likely counterfeit.",
  UnknownBatch: "WARNING: this batch number is not in the registry.",
};

// Small helper so every async route reports errors in the same JSON shape.
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || (err.code === "CALL_EXCEPTION" || err.code === "UNKNOWN_ERROR" ? 400 : 500);
    res.status(status).json({ error: err.status ? err.message : explainError(err) });
  });
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const requireDemo = (req, res, next) => (DEMO_MODE ? next() : res.status(403).json({ error: "Demo actions are disabled (DEMO_MODE=false)." }));
const needAddress = (v, label) => { if (!ethers.isAddress(v)) throw bad(`${label} must be a valid address`); return v; };
const needBatch = (id) => {
  const b = indexer.getBatch(Number(id));
  if (!b) throw bad("Batch not found", 404);
  return b;
};

// Always refresh from the chain first, then answer from the cache.
const fresh = (handler) => wrap(async (req, res) => { await indexer.sync(); return handler(req, res); });

// ───────────── Public (read-only) ─────────────
router.get("/health", wrap(async (_req, res) => {
  const block = await provider.getBlockNumber();
  res.json({ ok: true, demoMode: DEMO_MODE, block, contract: getDeployment().address });
}));

router.get("/stats", fresh((_req, res) => {
  const batches = indexer.allBatches();
  const count = (s) => batches.filter((b) => b.status === s).length;
  res.json({
    batches: batches.length,
    active: count("active"),
    recalled: count("recalled"),
    expired: count("expired"),
    packsRegistered: batches.reduce((n, b) => n + b.quantity, 0),
    packsDispensed: batches.reduce((n, b) => n + b.dispensed, 0),
    duplicateAlerts: indexer.state.alerts.length,
    actors: indexer.allActors().length + 1,
  });
}));

// ADVANCED SEARCH:  /api/batches?q=drug:paracetamol status:active&expiringInDays=60&sort=expiry
router.get("/batches", fresh((req, res) => res.json(searchBatches(indexer.allBatches(), req.query))));

router.get("/batches/:id", fresh((req, res) => res.json(needBatch(req.params.id))));

router.get("/actors", fresh((req, res) => {
  const reg = getDeployment().regulator;
  const regName = store.getDirectory()[reg.toLowerCase()]?.name || null;
  let actors = [{ address: reg, role: "regulator", name: regName }, ...indexer.allActors()];
  if (req.query.role) actors = actors.filter((a) => a.role === req.query.role);
  res.json(actors);
}));

router.get("/alerts", fresh((_req, res) => res.json([...indexer.state.alerts].reverse())));

// Patient verification: free `view` call on the contract.
router.post("/verify", wrap(async (req, res) => {
  let { batchId, serial, proof, payload } = req.body || {};
  if (payload) {
    try {
      const p = typeof payload === "string" ? JSON.parse(payload) : payload;
      ({ b: batchId, s: serial, p: proof } = p);
    } catch {
      throw bad("QR payload is not valid JSON");
    }
  }
  if (!batchId || !serial || !Array.isArray(proof)) throw bad("Need batchId, serial and proof[] (or a QR payload)");
  const code = Number(await getContract().verifyUnit(batchId, String(serial), proof));
  const status = STATUS[code];
  await indexer.sync();
  res.json({ status, ok: status === "Genuine", message: MESSAGES[status], batch: indexer.getBatch(Number(batchId)) });
}));

// ───────────── Demo actions (backend signs with test accounts) ─────────────
router.post("/batches", requireDemo, wrap(async (req, res) => {
  const { manufacturer, drugName, strength, form, quantity, expiresOn, notes } = req.body || {};
  needAddress(manufacturer, "manufacturer");
  const qty = Number(quantity);
  if (!drugName?.trim()) throw bad("drugName is required");
  if (!Number.isInteger(qty) || qty < 1 || qty > 500) throw bad("quantity must be a whole number from 1 to 500 (demo limit)");
  const expiry = Math.floor(new Date(expiresOn).getTime() / 1000);
  if (!expiry || expiry <= Date.now() / 1000) throw bad("expiresOn must be a future date");

  const meta = { drugName: drugName.trim(), strength: (strength || "").trim(), form: (form || "").trim(), notes: (notes || "").trim() };
  const serials = generateSerials(qty);
  const tree = buildBatch(serials);

  const tx = await getContract(await signerFor(manufacturer)).registerBatch(tree.root, store.hashMetadata(meta), expiry, qty);
  const receipt = await tx.wait();
  const iface = getContract().interface;
  const log = receipt.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((l) => l?.name === "BatchRegistered");
  const batchId = Number(log.args.batchId);

  store.saveBatchRecord(batchId, { meta, serials }); // serials are SECRET until printed on packs
  await indexer.sync();
  res.status(201).json(indexer.getBatch(batchId));
}));

router.post("/batches/:id/transfer", requireDemo, wrap(async (req, res) => {
  const { from, to } = req.body || {};
  needAddress(from, "from"); needAddress(to, "to");
  needBatch(req.params.id);
  await (await getContract(await signerFor(from)).transferCustody(req.params.id, to)).wait();
  await indexer.sync();
  res.json(indexer.getBatch(Number(req.params.id)));
}));

router.post("/batches/:id/dispense", requireDemo, wrap(async (req, res) => {
  const { pharmacy, serial } = req.body || {};
  needAddress(pharmacy, "pharmacy");
  needBatch(req.params.id);
  const rec = store.getBatchRecord(req.params.id);
  if (!rec?.serials.includes(serial)) throw bad("Serial not found for this batch");
  const proof = buildBatch(rec.serials).proofOf(serial);
  const receipt = await (await getContract(await signerFor(pharmacy)).dispense(req.params.id, serial, proof)).wait();
  const iface = getContract().interface;
  const names = receipt.logs.map((l) => { try { return iface.parseLog(l)?.name; } catch { return null; } });
  await indexer.sync();
  res.json({ duplicate: names.includes("DuplicateScan"), batch: indexer.getBatch(Number(req.params.id)) });
}));

router.post("/batches/:id/recall", requireDemo, wrap(async (req, res) => {
  const { by, reason } = req.body || {};
  needAddress(by, "by");
  needBatch(req.params.id);
  await (await getContract(await signerFor(by)).recallBatch(req.params.id, ethers.id(reason || "unspecified"))).wait();
  await indexer.sync();
  res.json(indexer.getBatch(Number(req.params.id)));
}));

// Lists packs with ready-to-scan QR payloads. Demo only: a real system never exposes serials like this.
router.get("/batches/:id/units", requireDemo, fresh(async (req, res) => {
  needBatch(req.params.id);
  const rec = store.getBatchRecord(req.params.id);
  if (!rec) throw bad("No off-chain record for this batch", 404);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const tree = buildBatch(rec.serials);
  const slice = rec.serials.slice((page - 1) * limit, page * limit);
  const contract = getContract();
  const items = await Promise.all(slice.map(async (serial) => {
    const proof = tree.proofOf(serial);
    return { serial, status: STATUS[Number(await contract.verifyUnit(req.params.id, serial, proof))], qr: { b: Number(req.params.id), s: serial, p: proof } };
  }));
  res.json({ total: rec.serials.length, page, limit, items });
}));

module.exports = router;
