import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const factory = await ethers.getContractFactory("ArtifactRegistry");
  const contract = await factory.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const network = await ethers.provider.getNetwork();
  const deploymentTransaction = contract.deploymentTransaction();

  console.log("ArtifactRegistry deployed");
  console.log(`address=${address}`);
  console.log(`deployer=${deployer.address}`);
  console.log(`chainId=${network.chainId.toString()}`);

  if (deploymentTransaction !== null) {
    console.log(`deploymentTx=${deploymentTransaction.hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
