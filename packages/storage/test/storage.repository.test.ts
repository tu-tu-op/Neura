import assert from "node:assert/strict";
import test from "node:test";

import {
  DataLoopStorageRepository,
  StorageConflictError,
  StorageNotFoundError,
  StorageValidationError
} from "../src";

interface TaskRecordRow {
  id: string;
  taskId: string;
  creatorAddress: string;
  createdAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  chainId: number | null;
  contractAddress: string | null;
  transactionHash: string | null;
  blockNumber: bigint | null;
  logIndex: number | null;
  insertedAt: Date;
  updatedAt: Date;
}

interface CorrectionRecordRow {
  id: string;
  correctionId: string;
  taskRecordId: string;
  submitterAddress: string;
  submittedAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  chainId: number | null;
  contractAddress: string | null;
  transactionHash: string | null;
  blockNumber: bigint | null;
  logIndex: number | null;
  insertedAt: Date;
  updatedAt: Date;
}

interface DatasetRow {
  id: string;
  datasetId: string;
  createdBy: string;
  createdAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  latestVersionNumber: number;
  insertedAt: Date;
  updatedAt: Date;
}

interface DatasetEntryRow {
  id: string;
  datasetVersionId: string;
  sourceType: "TASK" | "CORRECTION";
  position: number;
  taskRecordId: string | null;
  correctionRecordId: string | null;
  metadataUri: string | null;
  metadataHash: string | null;
  insertedAt: Date;
}

interface DatasetVersionRow {
  id: string;
  datasetRefId: string;
  versionNumber: number;
  registeredBy: string;
  registeredAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  immutableRef: string;
  chainId: number | null;
  contractAddress: string | null;
  transactionHash: string | null;
  blockNumber: bigint | null;
  logIndex: number | null;
  insertedAt: Date;
}

class FakeStorageDbClient {
  private taskCounter = 1;
  private correctionCounter = 1;
  private datasetCounter = 1;
  private datasetVersionCounter = 1;
  private datasetEntryCounter = 1;
  private tickCounter = 0;

  private readonly tasks: TaskRecordRow[] = [];
  private readonly corrections: CorrectionRecordRow[] = [];
  private readonly datasets: DatasetRow[] = [];
  private readonly datasetVersions: DatasetVersionRow[] = [];
  private readonly datasetEntries: DatasetEntryRow[] = [];

  readonly taskRecord = {
    create: async ({ data }: { data: Omit<TaskRecordRow, "id" | "insertedAt" | "updatedAt"> }) => {
      const record: TaskRecordRow = {
        id: `task-row-${this.taskCounter++}`,
        insertedAt: this.tick(),
        updatedAt: this.tick(),
        ...data
      };

      this.tasks.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { taskId: string } }) => {
      return this.tasks.find((record) => record.taskId === where.taskId) ?? null;
    }
  };

  readonly correctionRecord = {
    create: async ({
      data
    }: {
      data: Omit<CorrectionRecordRow, "id" | "insertedAt" | "updatedAt">;
    }) => {
      const record: CorrectionRecordRow = {
        id: `correction-row-${this.correctionCounter++}`,
        insertedAt: this.tick(),
        updatedAt: this.tick(),
        ...data
      };

      this.corrections.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { correctionId: string } }) => {
      return this.corrections.find((record) => record.correctionId === where.correctionId) ?? null;
    },
    findMany: async ({
      where,
      orderBy
    }: {
      where: { taskRecordId: string };
      orderBy: Array<{ submittedAt: "asc" | "desc" } | { correctionId: "asc" | "desc" }>;
    }) => {
      const records = this.corrections.filter((record) => record.taskRecordId === where.taskRecordId);

      return [...records].sort((left, right) => {
        for (const clause of orderBy) {
          if ("submittedAt" in clause) {
            const delta = left.submittedAt.getTime() - right.submittedAt.getTime();
            if (delta !== 0) {
              return clause.submittedAt === "asc" ? delta : -delta;
            }
          }

          if ("correctionId" in clause) {
            const delta = left.correctionId.localeCompare(right.correctionId);
            if (delta !== 0) {
              return clause.correctionId === "asc" ? delta : -delta;
            }
          }
        }

        return 0;
      });
    }
  };

  readonly dataset = {
    create: async ({
      data
    }: {
      data: Omit<DatasetRow, "id" | "insertedAt" | "updatedAt">;
    }) => {
      const record: DatasetRow = {
        id: `dataset-row-${this.datasetCounter++}`,
        insertedAt: this.tick(),
        updatedAt: this.tick(),
        ...data
      };

      this.datasets.push(record);
      return record;
    },
    findUnique: async ({ where }: { where: { datasetId: string } }) => {
      return this.datasets.find((record) => record.datasetId === where.datasetId) ?? null;
    },
    update: async ({
      where,
      data
    }: {
      where: { id: string };
      data: { latestVersionNumber: number };
    }) => {
      const record = this.datasets.find((item) => item.id === where.id);

      if (record === undefined) {
        throw new Error(`dataset not found: ${where.id}`);
      }

      record.latestVersionNumber = data.latestVersionNumber;
      record.updatedAt = this.tick();
      return record;
    }
  };

  readonly datasetVersion = {
    create: async ({
      data
    }: {
      data: Omit<DatasetVersionRow, "id" | "insertedAt"> & {
        entries: {
          create: Array<
            Omit<
              DatasetEntryRow,
              "id" | "datasetVersionId" | "insertedAt"
            >
          >;
        };
      };
      include: unknown;
    }) => {
      const versionRecord: DatasetVersionRow = {
        id: `dataset-version-row-${this.datasetVersionCounter++}`,
        insertedAt: this.tick(),
        datasetRefId: data.datasetRefId,
        versionNumber: data.versionNumber,
        registeredBy: data.registeredBy,
        registeredAt: data.registeredAt,
        metadataUri: data.metadataUri,
        metadataHash: data.metadataHash,
        immutableRef: data.immutableRef,
        chainId: data.chainId,
        contractAddress: data.contractAddress,
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber,
        logIndex: data.logIndex
      };

      this.datasetVersions.push(versionRecord);

      for (const entry of data.entries.create) {
        this.datasetEntries.push({
          id: `dataset-entry-row-${this.datasetEntryCounter++}`,
          datasetVersionId: versionRecord.id,
          insertedAt: this.tick(),
          ...entry
        });
      }

      return this.expandDatasetVersion(versionRecord);
    },
    findMany: async ({
      where,
      orderBy
    }: {
      where: { datasetRefId: string };
      orderBy: { versionNumber: "asc" | "desc" };
      include: unknown;
    }) => {
      const versions = this.datasetVersions.filter((record) => record.datasetRefId === where.datasetRefId);
      const sorted = [...versions].sort((left, right) =>
        orderBy.versionNumber === "asc"
          ? left.versionNumber - right.versionNumber
          : right.versionNumber - left.versionNumber
      );

      return sorted.map((record) => this.expandDatasetVersion(record));
    },
    findFirst: async ({
      where,
      orderBy
    }: {
      where: { datasetRefId: string };
      orderBy: { versionNumber: "asc" | "desc" };
      include: unknown;
    }) => {
      const rows = await this.datasetVersion.findMany({
        where,
        orderBy,
        include: {}
      });

      return rows[0] ?? null;
    }
  };

  async $transaction<T>(fn: (tx: FakeStorageDbClient) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private expandDatasetVersion(record: DatasetVersionRow) {
    const entries = this.datasetEntries
      .filter((entry) => entry.datasetVersionId === record.id)
      .map((entry) => ({
        ...entry,
        taskRecord:
          entry.taskRecordId === null
            ? null
            : {
                taskId:
                  this.tasks.find((task) => task.id === entry.taskRecordId)?.taskId ?? ""
              },
        correctionRecord:
          entry.correctionRecordId === null
            ? null
            : {
                correctionId:
                  this.corrections.find((correction) => correction.id === entry.correctionRecordId)
                    ?.correctionId ?? ""
              }
      }));

    return {
      ...record,
      entries
    };
  }

  private tick() {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.tickCounter++));
  }
}

function createRepository() {
  return new DataLoopStorageRepository(new FakeStorageDbClient() as never);
}

test("createTaskRecord persists and retrieves a task", async () => {
  const repository = createRepository();
  const createdAt = new Date("2026-04-18T10:00:00.000Z");

  const record = await repository.createTaskRecord({
    taskId: "task-001",
    creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    createdAt,
    metadataUri: "ipfs://task-001",
    metadataHash: "hash-task-001"
  });

  assert.equal(record.taskId, "task-001");
  assert.equal(record.creatorAddress, "0x1234567890abcdef1234567890abcdef12345678");
  assert.equal(record.metadataUri, "ipfs://task-001");
  assert.equal(record.metadataHash, "hash-task-001");

  const fetched = await repository.getTaskById("task-001");
  assert.deepEqual(fetched, record);

  await assert.rejects(
    repository.createTaskRecord({
      taskId: "task-001",
      creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
      createdAt,
      metadataHash: "duplicate"
    }),
    StorageConflictError
  );
});

test("saveCorrectionSubmission stores corrections and lists them deterministically", async () => {
  const repository = createRepository();

  await repository.createTaskRecord({
    taskId: "task-ordered",
    creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    createdAt: new Date("2026-04-18T10:00:00.000Z"),
    metadataHash: "task-hash"
  });

  await repository.saveCorrectionSubmission({
    correctionId: "correction-b",
    taskId: "task-ordered",
    submitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    submittedAt: new Date("2026-04-18T10:10:00.000Z"),
    metadataHash: "correction-b"
  });

  await repository.saveCorrectionSubmission({
    correctionId: "correction-a",
    taskId: "task-ordered",
    submitterAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    submittedAt: new Date("2026-04-18T10:10:00.000Z"),
    metadataHash: "correction-a"
  });

  const corrections = await repository.listCorrectionsForTask("task-ordered");

  assert.deepEqual(
    corrections.map((record) => record.correctionId),
    ["correction-a", "correction-b"]
  );

  await assert.rejects(
    repository.saveCorrectionSubmission({
      correctionId: "missing-task-correction",
      taskId: "missing-task",
      submitterAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      submittedAt: new Date("2026-04-18T10:11:00.000Z"),
      metadataHash: "missing"
    }),
    StorageNotFoundError
  );
});

test("registerDatasetVersion creates versioned datasets with stable history and latest lookup", async () => {
  const repository = createRepository();

  await repository.createTaskRecord({
    taskId: "task-100",
    creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    createdAt: new Date("2026-04-18T10:00:00.000Z"),
    metadataUri: "ipfs://task-100",
    metadataHash: "task-100-hash"
  });

  await repository.saveCorrectionSubmission({
    correctionId: "correction-100",
    taskId: "task-100",
    submitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    submittedAt: new Date("2026-04-18T10:05:00.000Z"),
    metadataUri: "ipfs://correction-100",
    metadataHash: "correction-100-hash"
  });

  const versionOne = await repository.registerDatasetVersion({
    datasetId: "dataset-100",
    registeredBy: "0x9999999999999999999999999999999999999999",
    registeredAt: new Date("2026-04-18T11:00:00.000Z"),
    metadataUri: "ipfs://dataset-v1",
    metadataHash: "dataset-v1-hash",
    entries: [
      { sourceType: "TASK", taskId: "task-100" },
      { sourceType: "CORRECTION", correctionId: "correction-100" }
    ]
  });

  const versionTwo = await repository.registerDatasetVersion({
    datasetId: "dataset-100",
    registeredBy: "0x9999999999999999999999999999999999999999",
    registeredAt: new Date("2026-04-18T12:00:00.000Z"),
    metadataUri: "ipfs://dataset-v2",
    metadataHash: "dataset-v2-hash",
    immutableRef: "dataset-v2-immutable",
    entries: [{ sourceType: "TASK", taskId: "task-100", metadataHash: "entry-override" }]
  });

  assert.equal(versionOne.versionNumber, 1);
  assert.equal(versionOne.entries[0]?.taskId, "task-100");
  assert.equal(versionOne.entries[0]?.metadataHash, "task-100-hash");
  assert.equal(versionOne.entries[1]?.correctionId, "correction-100");
  assert.equal(versionOne.entries[1]?.metadataHash, "correction-100-hash");

  const dataset = await repository.getDatasetById("dataset-100");
  assert.equal(dataset?.latestVersionNumber, 2);

  const history = await repository.getDatasetVersionHistory("dataset-100");
  assert.deepEqual(
    history.map((version) => version.versionNumber),
    [1, 2]
  );
  assert.equal(history[1]?.entries[0]?.metadataHash, "entry-override");

  const latest = await repository.fetchLatestVersion("dataset-100");
  assert.equal(latest?.versionNumber, versionTwo.versionNumber);
  assert.equal(latest?.immutableRef, "dataset-v2-immutable");
});

test("validation rejects malformed dataset writes", async () => {
  const repository = createRepository();

  await repository.createTaskRecord({
    taskId: "task-validation",
    creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    createdAt: new Date("2026-04-18T10:00:00.000Z"),
    metadataHash: "task-validation-hash"
  });

  await assert.rejects(
    repository.createTaskRecord({
      taskId: "task-invalid-chain",
      creatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
      createdAt: new Date("2026-04-18T10:01:00.000Z"),
      metadataHash: "task-invalid-chain-hash",
      chainEvent: {
        transactionHash: "not-a-tx-hash"
      }
    }),
    StorageValidationError
  );

  await assert.rejects(
    repository.registerDatasetVersion({
      datasetId: "dataset-invalid",
      registeredBy: "0x9999999999999999999999999999999999999999",
      registeredAt: new Date("2026-04-18T11:00:00.000Z"),
      metadataHash: "dataset-invalid-hash",
      entries: [
        { sourceType: "TASK", taskId: "task-validation" },
        { sourceType: "TASK", taskId: "task-validation" }
      ]
    }),
    StorageValidationError
  );
});
