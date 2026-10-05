// Deploys the contract to the local chain and fills it with realistic demo data.
//   Terminal 1: npm run chain     Terminal 2: npm run seed
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { RPC_URL, DATA_DIR } = require("../src/config");
const store = require("../src/store");
const { generateSerials, buildBatch } = require("../src/lib/merkle");

const ARTIFACT = path.join(__dirname, "..", "..", "artifacts", "contracts", "MedChainRegistry.sol", "MedChainRegistry.json");
const DAY = 86400;

async function main() {
  if (!fs.existsSync(ARTIFACT)) throw new Error("Contract not compiled. Run: npm run compile");
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const accounts = await provider.listAccounts();
  if (accounts.length < 7) throw new Error("Need a Hardhat node with 7+ unlocked accounts (npm run chain)");
  const [regulator, aarav, kaveri, meridian, northline, citycare, greenleaf] = accounts;

  console.log("Deploying MedChainRegistry...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, regulator);
  const registry = await factory.deploy(regulator.address);
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "abi.json"), JSON.stringify(artifact.abi));
  fs.writeFileSync(path.join(DATA_DIR, "deployment.json"), JSON.stringify({ address, regulator: regulator.address, chainId: Number((await provider.getNetwork()).chainId) }, null, 2));
  store.reset();

  const R = { MANUFACTURER: await registry.MANUFACTURER_ROLE(), DISTRIBUTOR: await registry.DISTRIBUTOR_ROLE(), PHARMACY: await registry.PHARMACY_ROLE() };
  const people = [
    [regulator, "State Drug Regulator", "regulator", null],
    [aarav, "Aarav Pharma Pvt Ltd", "manufacturer", "MFG-UP-0001"],
    [kaveri, "Kaveri Labs", "manufacturer", "MFG-KA-0002"],
    [meridian, "Meridian Distributors", "distributor", "DIST-UP-0042"],
    [northline, "Northline Logistics", "distributor", "DIST-DL-0107"],
    [citycare, "CityCare Pharmacy", "pharmacy", "PHARM-UP-0777"],
    [greenleaf, "GreenLeaf Chemist", "pharmacy", "PHARM-UP-0912"],
  ];
  for (const [signer, name, role, licence] of people) {
    store.setActor(signer.address, { name, role });
    if (licence) await (await registry.connect(regulator).licenseActor(signer.address, R[role.toUpperCase()], ethers.id(licence))).wait();
  }
  console.log("Licensed", people.length - 1, "actors");

  const c = (s) => registry.connect(s);
  const catalog = [
    { m: aarav, drugName: "Paracetamol", strength: "500 mg", form: "Tablet", qty: 30, days: 540, notes: "Fever and pain relief" },
    { m: aarav, drugName: "Amoxicillin", strength: "250 mg", form: "Capsule", qty: 24, days: 300, notes: "Antibiotic" },
    { m: kaveri, drugName: "Insulin Glargine", strength: "100 IU/mL", form: "Injection", qty: 12, days: 120, notes: "Cold chain 2-8 C" },
    { m: kaveri, drugName: "Cetirizine", strength: "10 mg", form: "Tablet", qty: 20, days: 18, notes: "Allergy relief (expiring soon)" },
    { m: aarav, drugName: "Azithromycin", strength: "500 mg", form: "Tablet", qty: 16, days: 400, notes: "Antibiotic" },
    { m: kaveri, drugName: "Metformin", strength: "500 mg", form: "Tablet", qty: 28, days: 700, notes: "Type 2 diabetes" },
  ];
  const now = Math.floor(Date.now() / 1000);
  const ids = [];
  for (const [i, it] of catalog.entries()) {
    const meta = { drugName: it.drugName, strength: it.strength, form: it.form, notes: it.notes };
    const serials = generateSerials(it.qty);
    const tree = buildBatch(serials);
    await (await c(it.m).registerBatch(tree.root, store.hashMetadata(meta), now + it.days * DAY, it.qty)).wait();
    store.saveBatchRecord(i + 1, { meta, serials });
    ids.push({ id: i + 1, serials, tree });
  }

  const dispense = async (pharm, b, n) => { for (let k = 0; k < n; k++) await (await c(pharm).dispense(b.id, b.serials[k], b.tree.proofOf(b.serials[k]))).wait(); };
  // 1 Paracetamol: Aarav -> Meridian -> CityCare, 6 sold, then a CLONE of pack #1 is caught
  await (await c(aarav).transferCustody(1, meridian.address)).wait();
  await (await c(meridian).transferCustody(1, citycare.address)).wait();
  await dispense(citycare, ids[0], 6);
  await (await c(citycare).dispense(1, ids[0].serials[0], ids[0].tree.proofOf(ids[0].serials[0]))).wait(); // duplicate -> alert
  // 2 Amoxicillin: Aarav -> Northline -> GreenLeaf, 3 sold
  await (await c(aarav).transferCustody(2, northline.address)).wait();
  await (await c(northline).transferCustody(2, greenleaf.address)).wait();
  await dispense(greenleaf, ids[1], 3);
  // 3 Insulin: with Kaveri -> Meridian (in transit)
  await (await c(kaveri).transferCustody(3, meridian.address)).wait();
  // 4 Cetirizine: straight to CityCare, 2 sold
  await (await c(kaveri).transferCustody(4, citycare.address)).wait();
  await dispense(citycare, ids[3], 2);
  // 5 Azithromycin: recalled by regulator
  await (await c(aarav).transferCustody(5, greenleaf.address)).wait();
  await (await c(regulator).recallBatch(5, ethers.id("NSQ lab result"))).wait();
  // 6 Metformin stays with the manufacturer

  console.log(`\nDone! Contract: ${address}\nBatches: ${catalog.length}  (try batch #1 for a clone alert, #5 for a recall)`);
}

main().catch((e) => { console.error("Seed failed:", e.message); process.exitCode = 1; });
