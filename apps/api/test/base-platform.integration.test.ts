import assert from "node:assert/strict";
import test from "node:test";

import type {
    StoredCorrectionRecord,
    StoredDataset,
    StoredDatasetVersion,
    StoredTaskRecord
} from "@dataloop/storage";
import { StorageNotFoundError } from "@dataloop/storage";

import { buildApp } from "../src/app";
import type {
    CreateTaskChainResult,
    DataLoopChainClient,
    RegisterDatasetVersionChainResult,
    SubmitCorrectionChainResult
} from "../src/platform/blockchain";
import { BasePlatformService, type StoragePort } from "../src/platform/service";

const taskId = `0x${"12".repeat(32)}`;
const datasetId = `0x${"23".repeat(32)}`;
const metadataHash = `0x${"34".repeat(32)}`;
const updatedMetadataHash = `0x${"45".repeat(32)}`;
const creatorAddress = "0x1234567890abcdef1234567890abcdef12345678";
const submitterAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const registrarAddress = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const chainActorAddress = "0x9999999999999999999999999999999999999999";
const contractAddress = "0x8888888888888888888888888888888888888888";

class FakeChainClient implements DataLoopChainClient {
  private correctionId = 1;
  private datasetVersions = new Map<string, number>();
  private blockNumber = 2000n;

  async createTask(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<CreateTaskChainResult> {
    void input.stakeAmountWei;

    return {
      taskId: input.taskId,
      creatorAddress: chainActorAddress,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      stakeId: null,
      chainId: 16661,
      contractAddress,
      transactionHash: `0x${"56".repeat(32)}`,
      blockNumber: this.blockNumber++,
      logIndex: 0
    };
  }

  async submitCorrection(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<SubmitCorrectionChainResult> {
    void input.stakeAmountWei;

    return {
      correctionId: String(this.correctionId++),
      taskId: input.taskId,
      submitterAddress: chainActorAddress,
      submittedAt: new Date("2026-04-18T12:05:00.000Z"),
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      stakeId: null,
      chainId: 16661,
      contractAddress,
      transactionHash: `0x${"67".repeat(32)}`,
      blockNumber: this.blockNumber++,
      logIndex: 1
    };
  }

  async registerDatasetVersion(input: {
    datasetId: string;
    metadataUri?: string;
    metadataHash?: string;
  }): Promise<RegisterDatasetVersionChainResult> {
    const versionNumber = (this.datasetVersions.get(input.datasetId) ?? 0) + 1;
    this.datasetVersions.set(input.datasetId, versionNumber);

    return {
      datasetId: input.datasetId,
      versionNumber,
      registrarAddress: chainActorAddress,
      registeredAt: new Date(`2026-04-18T1${versionNumber}:10:00.000Z`),
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      chainId: 16661,
      contractAddress,
      transactionHash: `0x${"78".repeat(32)}`,
      blockNumber: this.blockNumber++,
      logIndex: 2
    };
  }
}

class InMemoryStorage implements StoragePort {
  private tasks = new Map<string, StoredTaskRecord>();
  private corrections = new Map<string, StoredCorrectionRecord>();
  private correctionsByTask = new Map<string, string[]>();
  private datasets = new Map<string, StoredDataset>();
  private datasetVersions = new Map<string, StoredDatasetVersion[]>();

  async createTaskRecord(input: {
    taskId: string;
    creatorAddress: string;
    createdAt: Date;
    metadataUri?: string;
    metadataHash?: string;
    chainEvent?: {
      chainId?: number;
      contractAddress?: string;
      transactionHash?: string;
      blockNumber?: bigint;
      logIndex?: number;
    };
  }): Promise<StoredTaskRecord> {
    const record: StoredTaskRecord = {
      id: `task-storage-${this.tasks.size + 1}`,
      taskId: input.taskId,
      creatorAddress: input.creatorAddress,
      createdAt: input.createdAt,
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      chainId: input.chainEvent?.chainId ?? null,
      contractAddress: input.chainEvent?.contractAddress ?? null,
      transactionHash: input.chainEvent?.transactionHash ?? null,
      blockNumber: input.chainEvent?.blockNumber ?? null,
      logIndex: input.chainEvent?.logIndex ?? null,
      insertedAt: input.createdAt,
      updatedAt: input.createdAt
    };

    this.tasks.set(record.taskId, record);
    this.correctionsByTask.set(record.taskId, []);
    return record;
  }

  async saveCorrectionSubmission(input: {
    correctionId: string;
    taskId: string;
    submitterAddress: string;
    submittedAt: Date;
    metadataUri?: string;
    metadataHash?: string;
    chainEvent?: {
      chainId?: number;
      contractAddress?: string;
      transactionHash?: string;
      blockNumber?: bigint;
      logIndex?: number;
    };
  }): Promise<StoredCorrectionRecord> {
    const record: StoredCorrectionRecord = {
      id: `correction-storage-${this.corrections.size + 1}`,
      correctionId: input.correctionId,
      taskId: input.taskId,
      submitterAddress: input.submitterAddress,
      submittedAt: input.submittedAt,
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      chainId: input.chainEvent?.chainId ?? null,
      contractAddress: input.chainEvent?.contractAddress ?? null,
      transactionHash: input.chainEvent?.transactionHash ?? null,
      blockNumber: input.chainEvent?.blockNumber ?? null,
      logIndex: input.chainEvent?.logIndex ?? null,
      insertedAt: input.submittedAt,
      updatedAt: input.submittedAt
    };

    this.corrections.set(record.correctionId, record);
    this.correctionsByTask.get(record.taskId)?.push(record.correctionId);
    return record;
  }

  async registerDatasetVersion(input: {
    datasetId: string;
    registeredBy: string;
    registeredAt: Date;
    metadataUri?: string;
    metadataHash?: string;
    immutableRef?: string;
    chainEvent?: {
      chainId?: number;
      contractAddress?: string;
      transactionHash?: string;
      blockNumber?: bigint;
      logIndex?: number;
    };
    entries: Array<
      | {
          sourceType: "TASK";
          taskId: string;
          metadataUri?: string;
          metadataHash?: string;
        }
      | {
          sourceType: "CORRECTION";
          correctionId: string;
          metadataUri?: string;
          metadataHash?: string;
        }
    >;
  }): Promise<StoredDatasetVersion> {
    for (const entry of input.entries) {
      if (entry.sourceType === "TASK" && !this.tasks.has(entry.taskId)) {
        throw new StorageNotFoundError(`task record not found for taskId ${entry.taskId}`);
      }

      if (entry.sourceType === "CORRECTION" && !this.corrections.has(entry.correctionId)) {
        throw new StorageNotFoundError(
          `correction record not found for correctionId ${entry.correctionId}`
        );
      }
    }

    const versions = this.datasetVersions.get(input.datasetId) ?? [];
    const versionNumber = versions.length + 1;

    const dataset =
      this.datasets.get(input.datasetId) ??
      {
        id: `dataset-storage-${this.datasets.size + 1}`,
        datasetId: input.datasetId,
        createdBy: input.registeredBy,
        createdAt: input.registeredAt,
        metadataUri: input.metadataUri ?? null,
        metadataHash: input.metadataHash ?? null,
        latestVersionNumber: 0,
        insertedAt: input.registeredAt,
        updatedAt: input.registeredAt
      };

    const version: StoredDatasetVersion = {
      id: `dataset-version-storage-${versionNumber}`,
      datasetId: input.datasetId,
      versionNumber,
      registeredBy: input.registeredBy,
      registeredAt: input.registeredAt,
      metadataUri: input.metadataUri ?? null,
      metadataHash: input.metadataHash ?? null,
      immutableRef: input.immutableRef ?? input.metadataHash ?? input.metadataUri ?? "",
      chainId: input.chainEvent?.chainId ?? null,
      contractAddress: input.chainEvent?.contractAddress ?? null,
      transactionHash: input.chainEvent?.transactionHash ?? null,
      blockNumber: input.chainEvent?.blockNumber ?? null,
      logIndex: input.chainEvent?.logIndex ?? null,
      insertedAt: input.registeredAt,
      entries: input.entries.map((entry, index) => ({
        id: `dataset-entry-${versionNumber}-${index}`,
        datasetVersionId: `dataset-version-storage-${versionNumber}`,
        sourceType: entry.sourceType,
        position: index,
        taskId: entry.sourceType === "TASK" ? entry.taskId : null,
        correctionId: entry.sourceType === "CORRECTION" ? entry.correctionId : null,
        metadataUri:
          entry.metadataUri ??
          (entry.sourceType === "TASK"
            ? this.tasks.get(entry.taskId)?.metadataUri ?? null
            : this.corrections.get(entry.correctionId)?.metadataUri ?? null),
        metadataHash:
          entry.metadataHash ??
          (entry.sourceType === "TASK"
            ? this.tasks.get(entry.taskId)?.metadataHash ?? null
            : this.corrections.get(entry.correctionId)?.metadataHash ?? null),
        insertedAt: input.registeredAt
      }))
    };

    dataset.latestVersionNumber = versionNumber;
    dataset.updatedAt = input.registeredAt;

    this.datasets.set(dataset.datasetId, dataset);
    this.datasetVersions.set(dataset.datasetId, [...versions, version]);
    return version;
  }

  async getTaskById(taskIdValue: string) {
    return this.tasks.get(taskIdValue) ?? null;
  }

  async listCorrectionsForTask(taskIdValue: string) {
    const correctionIds = this.correctionsByTask.get(taskIdValue) ?? [];
    return correctionIds
      .map((correctionId) => this.corrections.get(correctionId))
      .filter((record): record is StoredCorrectionRecord => record !== undefined)
      .sort(
        (left, right) =>
          left.submittedAt.getTime() - right.submittedAt.getTime() ||
          left.correctionId.localeCompare(right.correctionId)
      );
  }

  async getDatasetById(datasetIdValue: string) {
    return this.datasets.get(datasetIdValue) ?? null;
  }

  async getDatasetVersionHistory(datasetIdValue: string) {
    return this.datasetVersions.get(datasetIdValue) ?? [];
  }

  async fetchLatestVersion(datasetIdValue: string) {
    const versions = this.datasetVersions.get(datasetIdValue) ?? [];
    return versions[versions.length - 1] ?? null;
  }
}

async function createTestApp() {
  const service = new BasePlatformService(new FakeChainClient(), new InMemoryStorage());

  return buildApp(
    {
      host: "127.0.0.1",
      port: 3001,
      webOrigin: "http://localhost:5173",
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/dataloop",
      nodeEnv: "test",
      blockchain: {
        chainId: 16661,
        rpcUrl: "http://localhost:8545",
        contractAddress,
        signerPrivateKey: `0x${"99".repeat(32)}`
      },
      agent: {
        modelMode: "mock",
        modelBaseUrl: null,
        modelName: "test-model",
        modelApiKey: null,
        requestTeeVerification: false,
        storage: {
          enabled: false,
          network: "testnet",
          suiRpcUrl: "https://fullnode.testnet.sui.io:443",
          defaultEpochs: 3,
          uploadRelayUrl: null,
          publisherUrl: null,
          aggregatorUrl: null,
          privateKey: null
        }
      }
    },
    { platformService: service }
  );
}

test("full base platform loop persists and returns latest canonical dataset state", async () => {
  const app = await createTestApp();

  const createTaskResponse = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      taskId,
      creatorAddress,
      metadataUri: "ipfs://week1/task",
      metadataHash
    }
  });

  assert.equal(createTaskResponse.statusCode, 201);

  const correctionResponse = await app.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/corrections`,
    payload: {
      submitterAddress,
      metadataUri: "ipfs://week1/correction",
      metadataHash
    }
  });

  assert.equal(correctionResponse.statusCode, 201);

  const versionOneResponse = await app.inject({
    method: "POST",
    url: `/v1/datasets/${datasetId}/versions`,
    payload: {
      registeredBy: registrarAddress,
      metadataUri: "ipfs://week1/dataset-v1",
      metadataHash,
      entries: [
        { sourceType: "TASK", taskId },
        { sourceType: "CORRECTION", correctionId: "1" }
      ]
    }
  });

  assert.equal(versionOneResponse.statusCode, 201);

  const versionTwoResponse = await app.inject({
    method: "POST",
    url: `/v1/datasets/${datasetId}/versions`,
    payload: {
      registeredBy: registrarAddress,
      metadataUri: "ipfs://week1/dataset-v2",
      metadataHash: updatedMetadataHash,
      immutableRef: "week1-dataset-v2-immutable",
      entries: [{ sourceType: "TASK", taskId, metadataHash: updatedMetadataHash }]
    }
  });

  assert.equal(versionTwoResponse.statusCode, 201);

  const latestResponse = await app.inject({
    method: "GET",
    url: `/v1/datasets/${datasetId}/latest`
  });

  assert.equal(latestResponse.statusCode, 200);
  const latestBody = latestResponse.json();
  assert.equal(latestBody.data.dataset.latestVersionNumber, 2);
  assert.equal(latestBody.data.version.versionNumber, 2);
  assert.equal(latestBody.data.version.entries.length, 1);
  assert.equal(latestBody.data.version.entries[0].sourceType, "TASK");
  assert.equal(latestBody.data.version.entries[0].taskId, taskId);
  assert.equal(latestBody.data.version.entries[0].metadataHash, updatedMetadataHash);

  await app.close();
});

test("error states are explicit for missing IDs, malformed payloads, and storage misses", async () => {
  const app = await createTestApp();

  const missingTaskResponse = await app.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/corrections`,
    payload: {
      submitterAddress,
      metadataHash
    }
  });

  assert.equal(missingTaskResponse.statusCode, 404);
  assert.equal(missingTaskResponse.json().error.code, "TASK_NOT_FOUND");

  const malformedTaskIdResponse = await app.inject({
    method: "POST",
    url: "/v1/tasks/not-a-bytes32/corrections",
    payload: {
      submitterAddress,
      metadataHash
    }
  });

  assert.equal(malformedTaskIdResponse.statusCode, 400);
  assert.equal(malformedTaskIdResponse.json().error.code, "INVALID_REQUEST");

  await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      taskId,
      creatorAddress,
      metadataHash
    }
  });

  const malformedPayloadResponse = await app.inject({
    method: "POST",
    url: `/v1/tasks/${taskId}/corrections`,
    payload: {
      submitterAddress: "bad-address",
      metadataHash
    }
  });

  assert.equal(malformedPayloadResponse.statusCode, 400);
  assert.equal(malformedPayloadResponse.json().error.code, "INVALID_REQUEST");

  const storageMissResponse = await app.inject({
    method: "POST",
    url: `/v1/datasets/${datasetId}/versions`,
    payload: {
      registeredBy: registrarAddress,
      metadataHash,
      entries: [{ sourceType: "CORRECTION", correctionId: "999" }]
    }
  });

  assert.equal(storageMissResponse.statusCode, 404);
  assert.equal(storageMissResponse.json().error.code, "RELATED_RECORD_NOT_FOUND");

  await app.close();
});
