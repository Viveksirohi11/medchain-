// Tiny JSON-file "database" for OFF-chain data.
// On-chain we only keep hashes; the readable details (drug name, serials...) live here.
const fs = require("fs");
const path = require("path");
const { id: keccakText } = require("ethers");
const { DATA_DIR } = require("./config");

const FILE = path.join(DATA_DIR, "store.json");
const empty = () => ({ directory: {}, batches: {} });

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return empty();
  }
}
function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

/** Same metadata always gives the same hash (keys sorted), so we can compare with the chain. */
function hashMetadata(meta) {
  const sorted = Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]]));
  return keccakText(JSON.stringify(sorted));
}

module.exports = {
  hashMetadata,
  reset: () => save(empty()),
  getDirectory: () => load().directory,
  setActor: (address, info) => {
    const db = load();
    db.directory[address.toLowerCase()] = info;
    save(db);
  },
  getBatchRecord: (batchId) => load().batches[String(batchId)] || null,
  saveBatchRecord: (batchId, record) => {
    const db = load();
    db.batches[String(batchId)] = record;
    save(db);
  },
  allBatchRecords: () => load().batches,
};
