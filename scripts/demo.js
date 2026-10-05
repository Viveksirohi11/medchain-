// End-to-end story on an in-process chain:  npm run demo
const hre = require("hardhat");
const { ethers } = hre;
const { generateSerials, buildBatch } = require("./lib/merkle");

const STATUS = ["UnknownBatch", "Invalid", "Genuine", "AlreadyDispensed", "Recalled", "Expired"];
const log = (m) => console.log(m);

async function main() {
  const [regulator, mfr, distributor, pharmacy] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("MedChainRegistry")).deploy(regulator.address);

  log("1. Regulator licenses the supply chain actors");
  await registry.licenseActor(mfr.address, await registry.MANUFACTURER_ROLE(), ethers.id("MFG-UP-0001"));
  await registry.licenseActor(distributor.address, await registry.DISTRIBUTOR_ROLE(), ethers.id("DIST-UP-0042"));
  await registry.licenseActor(pharmacy.address, await registry.PHARMACY_ROLE(), ethers.id("PHARM-UP-0777"));

  log("2. Manufacturer registers a batch of 5 packs (one Merkle root on-chain)");
  const serials = generateSerials(5);
  const batch = buildBatch(serials);
  const expiry = Math.floor(Date.now() / 1000) + 365 * 86400;
  await registry.connect(mfr).registerBatch(batch.root, ethers.id("paracetamol-500mg|lab-report-cid"), expiry, serials.length);
  const batchId = 1n; // printed in each pack's QR together with serial + proof

  log("3. Custody: manufacturer -> distributor -> pharmacy");
  await registry.connect(mfr).transferCustody(batchId, distributor.address);
  await registry.connect(distributor).transferCustody(batchId, pharmacy.address);

  const check = async (label, serial, proof) =>
    log(`   ${label}: ${STATUS[await registry.verifyUnit(batchId, serial, proof)]}`);

  log("4. Patient scans packs (free view call, no gas)");
  await check("pack #1 before sale ", serials[0], batch.proofOf(serials[0]));
  await check("fake pack (invented)", "MC-FAKE-SERIAL", batch.proofOf(serials[0]));

  log("5. Pharmacy sells pack #1");
  await registry.connect(pharmacy).dispense(batchId, serials[0], batch.proofOf(serials[0]));
  await check("pack #1 after sale  ", serials[0], batch.proofOf(serials[0]));
  log("   -> a cloned copy of pack #1 now shows AlreadyDispensed: counterfeit signal");

  log("6. Regulator recalls the batch");
  await registry.recallBatch(batchId, ethers.id("NSQ lab result"));
  await check("pack #2 after recall", serials[1], batch.proofOf(serials[1]));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
