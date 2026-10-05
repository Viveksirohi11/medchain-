// Reads contract events and keeps a fast, searchable copy in memory.
// Why? Asking the chain "list all batches" is slow; events + a cache make search instant.
const { id: keccakText } = require("ethers");
const { provider, getContract } = require("./chain");
const store = require("./store");

const ROLE_NAMES = {};
for (const r of ["MANUFACTURER", "DISTRIBUTOR", "PHARMACY"]) ROLE_NAMES[keccakText(`${r}_ROLE`)] = r.toLowerCase();

const state = { address: null, lastBlock: -1, batches: new Map(), actors: new Map(), alerts: [] };
const blockTimes = new Map();

function resetState() {
  state.lastBlock = -1;
  state.batches.clear();
  state.actors.clear();
  state.alerts = [];
  blockTimes.clear();
}

async function timeOf(blockNumber) {
  if (!blockTimes.has(blockNumber)) blockTimes.set(blockNumber, (await provider.getBlock(blockNumber)).timestamp);
  return blockTimes.get(blockNumber);
}

async function sync() {
  const contract = getContract();
  const latest = await provider.getBlockNumber();
  const address = await contract.getAddress();
  if (latest < state.lastBlock || address !== state.address) resetState(); // chain restarted or re-seeded
  state.address = address;
  if (latest === state.lastBlock) return;

  const logs = await contract.queryFilter("*", state.lastBlock + 1, latest);
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  for (const log of logs) {
    if (!log.fragment) continue;
    const a = log.args;
    const at = await timeOf(log.blockNumber);
    const base = { at, tx: log.transactionHash };

    switch (log.fragment.name) {
      case "ActorLicensed":
        state.actors.set(a.actor.toLowerCase(), { address: a.actor, role: ROLE_NAMES[a.role] || "unknown", licenseId: a.licenseId, since: at });
        break;
      case "ActorRevoked":
        state.actors.delete(a.actor.toLowerCase());
        break;
      case "BatchRegistered":
        state.batches.set(Number(a.batchId), {
          id: Number(a.batchId),
          manufacturer: a.manufacturer,
          custodian: a.manufacturer,
          merkleRoot: a.merkleRoot,
          metadataHash: a.metadataHash,
          quantity: Number(a.quantity),
          dispensed: 0,
          hops: 0,
          expiresAt: Number(a.expiresAt),
          registeredAt: at,
          recalled: false,
          duplicateScans: 0,
          history: [{ type: "registered", by: a.manufacturer, ...base }],
        });
        break;
      case "CustodyTransferred": {
        const b = state.batches.get(Number(a.batchId));
        if (!b) break;
        b.custodian = a.to;
        b.hops++;
        b.history.push({ type: "custody", from: a.from, to: a.to, ...base });
        break;
      }
      case "UnitDispensed": {
        const b = state.batches.get(Number(a.batchId));
        if (!b) break;
        b.dispensed++;
        b.history.push({ type: "dispensed", by: a.pharmacy, serialHash: a.serialHash, ...base });
        break;
      }
      case "DuplicateScan": {
        const b = state.batches.get(Number(a.batchId));
        if (!b) break;
        b.duplicateScans++;
        const alert = { batchId: Number(a.batchId), serialHash: a.serialHash, scanner: a.scanner, ...base };
        b.history.push({ type: "duplicate", ...alert });
        state.alerts.push(alert);
        break;
      }
      case "BatchRecalled": {
        const b = state.batches.get(Number(a.batchId));
        if (!b) break;
        b.recalled = true;
        b.history.push({ type: "recalled", by: a.by, reasonHash: a.reasonHash, ...base });
        break;
      }
    }
  }
  state.lastBlock = latest;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const statusOf = (b) => (b.recalled ? "recalled" : b.expiresAt <= nowSec() ? "expired" : "active");

/** Merge chain data + off-chain details + readable names into one flat object. */
function enrich(b) {
  const dir = store.getDirectory();
  const name = (addr) => dir[addr.toLowerCase()]?.name || null;
  const rec = store.getBatchRecord(b.id);
  const meta = rec?.meta || {};
  return {
    ...b,
    status: statusOf(b),
    meta,
    metadataVerified: rec ? store.hashMetadata(meta) === b.metadataHash : false,
    manufacturerName: name(b.manufacturer),
    custodianName: name(b.custodian),
    dispensedPct: Math.round((b.dispensed / b.quantity) * 100),
    daysToExpiry: Math.ceil((b.expiresAt - nowSec()) / 86400),
  };
}

const allBatches = () => [...state.batches.values()].map(enrich);
const getBatch = (id) => (state.batches.has(id) ? enrich(state.batches.get(id)) : null);
const allActors = () => {
  const dir = store.getDirectory();
  return [...state.actors.values()].map((x) => ({ ...x, name: dir[x.address.toLowerCase()]?.name || null }));
};

module.exports = { state, sync, resetState, allBatches, getBatch, allActors, statusOf };
