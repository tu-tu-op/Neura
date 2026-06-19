import { ethers } from "hardhat";

async function main() {
  const registryAddress = process.env.ARTIFACT_REGISTRY_CONTRACT_ADDRESS;

  if (registryAddress === undefined || !ethers.isAddress(registryAddress)) {
    throw new Error("ARTIFACT_REGISTRY_CONTRACT_ADDRESS must be set to a deployed registry address.");
  }

  const [registrar] = await ethers.getSigners();
  const registry = await ethers.getContractAt("ArtifactRegistry", registryAddress);
  const metadataURI = process.env.BOOTSTRAP_ARTIFACT_METADATA_URI ?? "walrus://artifact-metadata/excel.json";
  const metadataHash = process.env.BOOTSTRAP_ARTIFACT_METADATA_HASH ?? ethers.id("dataloop:artifact-metadata:excel:v1");
  const storageURI = process.env.BOOTSTRAP_ARTIFACT_STORAGE_URI ?? "walrus://artifact-marketplace/excel.md";
  const storageHash = process.env.BOOTSTRAP_ARTIFACT_STORAGE_HASH ?? ethers.id("dataloop:artifact:excel:v1");
  const nonce = await registry.nextArtifactNonce();
  const artifactId = await registry.computeArtifactId(
    registrar.address,
    nonce,
    metadataURI,
    metadataHash,
    storageURI,
    storageHash
  );
  const transaction = await registry.createArtifact(metadataURI, metadataHash, storageURI, storageHash);
  const receipt = await transaction.wait();

  console.log("Artifact registered");
  console.log(`registry=${registryAddress}`);
  console.log(`artifactId=${artifactId}`);
  console.log(`creator=${registrar.address}`);
  console.log(`version=1`);
  console.log(`metadataURI=${metadataURI}`);
  console.log(`metadataHash=${metadataHash}`);
  console.log(`storageURI=${storageURI}`);
  console.log(`storageHash=${storageHash}`);
  console.log(`transactionHash=${receipt?.hash ?? transaction.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
