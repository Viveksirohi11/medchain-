const hre = require("hardhat");

async function main() {
  const [regulator, ...accounts] = await hre.ethers.getSigners();
  console.log("Regulator:", regulator.address);
  accounts.forEach((account, i) =>
    console.log(`Account ${i + 2}:`, account.address)
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
