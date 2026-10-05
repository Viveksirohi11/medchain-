// Everything that talks to the blockchain lives here.
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract } = require("ethers");
const { RPC_URL, DATA_DIR } = require("./config");

const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1, batchMaxCount: 1 }) // no caching: we always want the freshest block;

let cached = null;
let cachedMtime = 0;
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

/** Loads ABI + deployed address written by `npm run seed`. */
function getContract(runner = provider) {
  // Re-read the files if `npm run seed` deployed a fresh contract while we were running.
  try {
    const m = fs.statSync(path.join(DATA_DIR, "deployment.json")).mtimeMs;
    if (m !== cachedMtime) { cached = null; cachedMtime = m; }
  } catch {}
  if (!cached) {
    try {
      const abi = readJson("abi.json");
      const deployment = readJson("deployment.json");
      cached = { abi, address: deployment.address, deployment };
    } catch {
      const err = new Error("Contract not deployed yet. Run: npm run chain  then  npm run seed");
      err.status = 503;
      throw err;
    }
  }
  return new Contract(cached.address, cached.abi, runner);
}

const getDeployment = () => (getContract(), cached.deployment);

/** Demo mode only: act as one of the unlocked Hardhat accounts. */
const signerFor = (address) => provider.getSigner(address);

/** Turn a Solidity custom error into a friendly sentence. */
const FRIENDLY = {
  NotCustodian: "That address does not currently hold this batch.",
  InvalidTransfer: "Custody can only go manufacturer → distributor → pharmacy.",
  InvalidProof: "That serial does not belong to this batch.",
  BatchExpired: "This batch has expired.",
  BatchNotActive: "This batch is not active (it may be recalled).",
  UnknownBatch: "Batch not found.",
  NotRecallAuthority: "Only the regulator or the batch manufacturer can recall.",
  InvalidParams: "Invalid parameters.",
  EnforcedPause: "The system is paused by the regulator.",
};
function explainError(err) {
  try {
    const data = err.data ?? err.info?.error?.data ?? err.error?.data;
    const parsed = data ? getContract().interface.parseError(data) : null;
    const name = parsed?.name || err.revert?.name;
    if (name) return FRIENDLY[name] || name;
    if (/AccessControl/i.test(err.message)) return "This address does not have the required role.";
  } catch {}
  return err.shortMessage || err.message;
}

module.exports = { provider, getContract, getDeployment, signerFor, explainError };
