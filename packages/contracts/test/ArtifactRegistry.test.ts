import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";

describe("ArtifactRegistry", function () {
  async function deployFixture() {
    const [creator, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ArtifactRegistry");
    const contract = await factory.deploy();

    await contract.waitForDeployment();

    return { contract, creator, outsider };
  }

  function id(label: string) {
    return ethers.id(label);
  }

  it("creates an artifact id and stores the Walrus artifact reference on-chain", async function () {
    const { contract, creator } = await deployFixture();
    const metadataURI = "walrus://artifact-metadata/excel.json";
    const storageURI = "walrus://artifact-marketplace/excel.md";
    const metadataHash = id("excel-metadata");
    const storageHash = id("excel-artifact");
    const nonce = await contract.nextArtifactNonce();
    const expectedArtifactId = await contract.computeArtifactId(
      creator.address,
      nonce,
      metadataURI,
      metadataHash,
      storageURI,
      storageHash
    );

    await expect(contract.createArtifact(metadataURI, metadataHash, storageURI, storageHash))
      .to.emit(contract, "ArtifactCreated")
      .withArgs(
        expectedArtifactId,
        creator.address,
        anyValue,
        1n,
        metadataURI,
        metadataHash,
        storageURI,
        storageHash
      );

    const artifact = await contract.getArtifact(expectedArtifactId);

    expect(artifact.id).to.equal(expectedArtifactId);
    expect(artifact.creator).to.equal(creator.address);
    expect(artifact.version).to.equal(1n);
    expect(artifact.metadataURI).to.equal(metadataURI);
    expect(artifact.metadataHash).to.equal(metadataHash);
    expect(artifact.storageURI).to.equal(storageURI);
    expect(artifact.storageHash).to.equal(storageHash);
    expect(await contract.artifactCount()).to.equal(1n);
    expect(await contract.getArtifactIdAt(0)).to.equal(expectedArtifactId);
    expect(await contract.getArtifactsByCreator(creator.address)).to.deep.equal([expectedArtifactId]);
  });

  it("rejects empty artifact references", async function () {
    const { contract } = await deployFixture();

    await expect(
      contract.createArtifact("", ethers.ZeroHash, "", ethers.ZeroHash)
    ).to.be.revertedWithCustomError(contract, "MissingArtifactReference");
  });

  it("lets only the creator update an artifact version", async function () {
    const { contract, outsider } = await deployFixture();
    const metadataURI = "walrus://artifact-metadata/excel.json";
    const storageURI = "walrus://artifact-marketplace/excel.md";
    const metadataHash = id("excel-metadata");
    const storageHash = id("excel-artifact");
    const nonce = await contract.nextArtifactNonce();
    const artifactId = await contract.computeArtifactId(
      (await ethers.getSigners())[0].address,
      nonce,
      metadataURI,
      metadataHash,
      storageURI,
      storageHash
    );

    await contract.createArtifact(metadataURI, metadataHash, storageURI, storageHash);

    await expect(
      contract
        .connect(outsider)
        .updateArtifact(
          artifactId,
          "walrus://artifact-metadata/excel-v2.json",
          id("excel-metadata-v2"),
          "walrus://artifact-marketplace/excel-v2.md",
          id("excel-artifact-v2")
        )
    ).to.be.revertedWithCustomError(contract, "Unauthorized");

    await expect(
      contract.updateArtifact(
        artifactId,
        "walrus://artifact-metadata/excel-v2.json",
        id("excel-metadata-v2"),
        "walrus://artifact-marketplace/excel-v2.md",
        id("excel-artifact-v2")
      )
    )
      .to.emit(contract, "ArtifactUpdated")
      .withArgs(
        artifactId,
        (await ethers.getSigners())[0].address,
        anyValue,
        2n,
        "walrus://artifact-metadata/excel-v2.json",
        id("excel-metadata-v2"),
        "walrus://artifact-marketplace/excel-v2.md",
        id("excel-artifact-v2")
      );

    const artifact = await contract.getArtifact(artifactId);
    expect(artifact.version).to.equal(2n);
    expect(artifact.storageURI).to.equal("walrus://artifact-marketplace/excel-v2.md");
  });
});
