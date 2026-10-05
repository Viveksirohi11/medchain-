// Off-chain helpers: serial generation + Merkle tree matching MedChainRegistry._leaf().
const crypto = require("crypto");
const { solidityPackedKeccak256 } = require("ethers");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

/** 128-bit random, unguessable serials, e.g. "MC-3F9A1C2B-...". */
function generateSerials(count) {
  const set = new Set();
  while (set.size < count) {
    set.add("MC-" + crypto.randomBytes(16).toString("hex").toUpperCase().match(/.{8}/g).join("-"));
  }
  return [...set];
}

const serialHash = (serial) => solidityPackedKeccak256(["string"], [serial]);

function buildBatch(serials) {
  const tree = StandardMerkleTree.of(
    serials.map((s) => [serialHash(s)]),
    ["bytes32"]
  );
  return {
    serials,
    tree,
    root: tree.root,
    proofOf: (serial) => tree.getProof([serialHash(serial)]),
  };
}

module.exports = { generateSerials, serialHash, buildBatch };
