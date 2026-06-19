import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = process.env.CONTRACT_OWNER ?? deployer.address;
  const minimumStakeLockPeriod = BigInt(process.env.STAKE_LOCK_PERIOD_SECONDS ?? "86400");

  const factory = await ethers.getContractFactory("DataLoopCore");
  const contract = await factory.deploy(owner, minimumStakeLockPeriod);

  await contract.waitForDeployment();

  console.log("DataLoopCore deployed");
  console.log(`address=${await contract.getAddress()}`);
  console.log(`owner=${owner}`);
  console.log(`minimumStakeLockPeriod=${minimumStakeLockPeriod.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
