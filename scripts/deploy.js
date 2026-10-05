const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  console.log(`Deploying MedChainRegistry\n  network: ${hre.network.name}\n  deployer: ${deployer.address}\n  regulator/admin: ${admin}`);

  const registry = await (await hre.ethers.getContractFactory("MedChainRegistry")).deploy(admin);
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`MedChainRegistry deployed to: ${address}`);

  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    console.log(`\nVerify with:\n  npx hardhat verify --network ${hre.network.name} ${address} ${admin}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
