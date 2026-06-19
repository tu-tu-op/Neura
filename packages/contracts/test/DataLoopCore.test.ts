import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";

describe("DataLoopCore", function () {
  async function deployFixture() {
    const [owner, creator, submitter, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("DataLoopCore");
    const contract = await factory.deploy(owner.address, 3600);

    await contract.waitForDeployment();

    return { contract, owner, creator, submitter, outsider };
  }

  function id(label: string) {
    return ethers.id(label);
  }

  describe("tasks", function () {
    it("creates a task and records its initial stake", async function () {
      const { contract, creator } = await deployFixture();
      const taskId = id("task-1");
      const metadataHash = id("task-metadata-1");
      const stakeAmount = ethers.parseEther("1");

      await expect(
        contract.connect(creator).createTask(taskId, "ipfs://task-1", metadataHash, {
          value: stakeAmount
        })
      )
        .to.emit(contract, "TaskCreated")
        .withArgs(taskId, creator.address, anyValue, "ipfs://task-1", metadataHash);

      const task = await contract.getTask(taskId);
      expect(task.id).to.equal(taskId);
      expect(task.creator).to.equal(creator.address);
      expect(task.metadataURI).to.equal("ipfs://task-1");
      expect(task.metadataHash).to.equal(metadataHash);
      expect(task.totalStake).to.equal(stakeAmount);

      const stake = await contract.getStake(1n);
      expect(stake.referenceType).to.equal(0n);
      expect(stake.taskId).to.equal(taskId);
      expect(stake.amount).to.equal(stakeAmount);
    });

    it("rejects duplicate task identifiers", async function () {
      const { contract, creator } = await deployFixture();
      const taskId = id("task-duplicate");

      await contract.connect(creator).createTask(taskId, "ipfs://first", id("first"));

      await expect(
        contract.connect(creator).createTask(taskId, "ipfs://second", id("second"))
      )
        .to.be.revertedWithCustomError(contract, "TaskAlreadyExists")
        .withArgs(taskId);
    });
  });

  describe("corrections", function () {
    it("links a correction to an existing task and records stake", async function () {
      const { contract, creator, submitter } = await deployFixture();
      const taskId = id("task-with-correction");
      const correctionHash = id("correction-1");
      const stakeAmount = ethers.parseEther("0.25");

      await contract.connect(creator).createTask(taskId, "ipfs://task", id("task"));

      await expect(
        contract
          .connect(submitter)
          .submitCorrection(taskId, "ipfs://correction-1", correctionHash, {
            value: stakeAmount
          })
      )
        .to.emit(contract, "CorrectionSubmitted")
        .withArgs(1n, taskId, submitter.address, anyValue, "ipfs://correction-1", correctionHash);

      const correction = await contract.getCorrection(1n);
      expect(correction.taskId).to.equal(taskId);
      expect(correction.submitter).to.equal(submitter.address);
      expect(correction.totalStake).to.equal(stakeAmount);

      const linkedCorrectionIds = await contract.getCorrectionsForTask(taskId);
      expect(linkedCorrectionIds).to.deep.equal([1n]);

      const task = await contract.getTask(taskId);
      expect(task.totalStake).to.equal(stakeAmount);
    });

    it("rejects corrections for unknown tasks", async function () {
      const { contract, submitter } = await deployFixture();
      const missingTaskId = id("missing-task");

      await expect(
        contract
          .connect(submitter)
          .submitCorrection(missingTaskId, "ipfs://correction", id("correction"))
      )
        .to.be.revertedWithCustomError(contract, "TaskNotFound")
        .withArgs(missingTaskId);
    });
  });

  describe("dataset registry", function () {
    it("registers immutable dataset versions sequentially", async function () {
      const { contract, owner } = await deployFixture();
      const datasetId = id("dataset-1");

      await expect(
        contract.connect(owner).registerDatasetVersion(datasetId, "ipfs://dataset-v1", id("v1"))
      )
        .to.emit(contract, "DatasetRegistered")
        .withArgs(datasetId, 1n, owner.address, anyValue, "ipfs://dataset-v1", id("v1"));

      await contract
        .connect(owner)
        .registerDatasetVersion(datasetId, "ipfs://dataset-v2", id("v2"));

      expect(await contract.latestDatasetVersion(datasetId)).to.equal(2n);

      const versionOne = await contract.getDatasetVersion(datasetId, 1n);
      const versionTwo = await contract.getDatasetVersion(datasetId, 2n);

      expect(versionOne.version).to.equal(1n);
      expect(versionOne.metadataURI).to.equal("ipfs://dataset-v1");
      expect(versionOne.metadataHash).to.equal(id("v1"));
      expect(versionTwo.version).to.equal(2n);
      expect(versionTwo.metadataURI).to.equal("ipfs://dataset-v2");
      expect(versionTwo.metadataHash).to.equal(id("v2"));
    });

    it("restricts dataset registration to the owner", async function () {
      const { contract, creator } = await deployFixture();

      await expect(
        contract
          .connect(creator)
          .registerDatasetVersion(id("dataset-restricted"), "ipfs://dataset", id("dataset"))
      ).to.be.revertedWithCustomError(contract, "Unauthorized");
    });
  });

  describe("staking", function () {
    it("allows stake deposits for an existing correction and releases after lock expiry", async function () {
      const { contract, creator, submitter } = await deployFixture();
      const taskId = id("task-stake-flow");
      const stakeAmount = ethers.parseEther("0.5");

      await contract.connect(creator).createTask(taskId, "ipfs://task", id("task"));
      await contract
        .connect(submitter)
        .submitCorrection(taskId, "ipfs://correction", id("correction"));

      await contract.connect(submitter).depositStakeForCorrection(1n, { value: stakeAmount });

      const stake = await contract.getStake(1n);
      expect(stake.referenceType).to.equal(1n);
      expect(stake.correctionId).to.equal(1n);
      expect(stake.amount).to.equal(stakeAmount);

      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);

      await expect(contract.connect(submitter).releaseStake(1n))
        .to.emit(contract, "StakeReleased")
        .withArgs(1n, submitter.address, stakeAmount, submitter.address);
    });

    it("blocks early or unauthorized stake release", async function () {
      const { contract, creator, outsider } = await deployFixture();
      const taskId = id("task-locked");

      await contract.connect(creator).createTask(taskId, "ipfs://task", id("task"), {
        value: ethers.parseEther("0.1")
      });

      await expect(contract.connect(outsider).releaseStake(1n))
        .to.be.revertedWithCustomError(contract, "Unauthorized");

      await expect(contract.connect(creator).releaseStake(1n))
        .to.be.revertedWithCustomError(contract, "StakeStillLocked")
        .withArgs(1n, anyValue);
    });

    it("allows the owner to release a stake before the user lock expires", async function () {
      const { contract, owner, creator } = await deployFixture();
      const taskId = id("task-owner-release");
      const stakeAmount = ethers.parseEther("0.2");

      await contract.connect(creator).createTask(taskId, "ipfs://task", id("task"), {
        value: stakeAmount
      });

      await expect(contract.connect(owner).releaseStake(1n))
        .to.emit(contract, "StakeReleased")
        .withArgs(1n, creator.address, stakeAmount, owner.address);
    });
  });
});
