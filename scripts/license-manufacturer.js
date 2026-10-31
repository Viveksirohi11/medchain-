const { ethers } = require("hardhat");
const deployment = require("../backend/data/deployment.json");

async function main() {
  const [regulator] = await ethers.getSigners();
  const registry = await ethers.getContractAt(
    "MedChainRegistry",
    deployment.address,
    regulator
  );

  const wallet = "0xeA5f180B972D77b5885E3a4294B1F50DD1e9Fd89";
  const role = await registry.MANUFACTURER_ROLE();
  const tx = await registry.licenseActor(wallet, role, ethers.id("MFG-UP-0001"));

  await tx.wait();
  console.log("Manufacturer licensed:", wallet);
  console.log("Transaction:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
