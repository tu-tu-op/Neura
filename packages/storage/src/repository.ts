import { prisma } from "./client";
import {
  StorageConflictError,
  StorageNotFoundError,
  StorageValidationError
} from "./errors";
import type {
  CreateTaskRecordInput,
  RegisterDatasetVersionInput,
  SaveCorrectionSubmissionInput,
  StoredCorrectionRecord,
  StoredDataset,
  StoredDatasetEntry,
  StoredDatasetVersion,
  StoredTaskRecord
} from "./types";
import {
  ensureUniqueDatasetEntries,
  optionalString,
  requireDate,
  requireMetadataReference,
  requireNonEmptyString,
  validateChainEventReference
} from "./validation";

type SortOrder = "asc" | "desc";

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
  taskRecord?: { taskId: string } | null;
  correctionRecord?: { correctionId: string } | null;
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

interface DatasetVersionRowWithEntries extends DatasetVersionRow {
  entries: DatasetEntryRow[];
}

interface StorageDbClient {
  $transaction<T>(fn: (tx: StorageDbClient) => Promise<T>): Promise<T>;
  taskRecord: {
    create(args: { data: Omit<TaskRecordRow, "id" | "insertedAt" | "updatedAt"> }): Promise<TaskRecordRow>;
    findUnique(args: { where: { taskId: string } }): Promise<TaskRecordRow | null>;
  };
  correctionRecord: {
    create(
      args: { data: Omit<CorrectionRecordRow, "id" | "insertedAt" | "updatedAt"> }
    ): Promise<CorrectionRecordRow>;
    findUnique(args: { where: { correctionId: string } }): Promise<CorrectionRecordRow | null>;
    findMany(args: {
      where: { taskRecordId: string };
      orderBy: Array<{ submittedAt: SortOrder } | { correctionId: SortOrder }>;
    }): Promise<CorrectionRecordRow[]>;
  };
  dataset: {
    create(args: {
      data: Omit<DatasetRow, "id" | "insertedAt" | "updatedAt">;
    }): Promise<DatasetRow>;
    findUnique(args: { where: { datasetId: string } }): Promise<DatasetRow | null>;
    update(args: { where: { id: string }; data: { latestVersionNumber: number } }): Promise<DatasetRow>;
  };
  datasetVersion: {
    create(args: {
      data: Omit<DatasetVersionRow, "id" | "insertedAt"> & {
        entries: {
          create: Array<Omit<DatasetEntryRow, "id" | "datasetVersionId" | "insertedAt" | "taskRecord" | "correctionRecord">>;
        };
      };
      include: {
        entries: {
          include: {
            taskRecord: { select: { taskId: true } };
            correctionRecord: { select: { correctionId: true } };
          };
        };
      };
    }): Promise<DatasetVersionRowWithEntries>;
    findMany(args: {
      where: { datasetRefId: string };
      orderBy: { versionNumber: SortOrder };
      include: {
        entries: {
          include: {
            taskRecord: { select: { taskId: true } };
            correctionRecord: { select: { correctionId: true } };
          };
        };
      };
    }): Promise<DatasetVersionRowWithEntries[]>;
    findFirst(args: {
      where: { datasetRefId: string };
      orderBy: { versionNumber: SortOrder };
      include: {
        entries: {
          include: {
            taskRecord: { select: { taskId: true } };
            correctionRecord: { select: { correctionId: true } };
          };
        };
      };
    }): Promise<DatasetVersionRowWithEntries | null>;
  };
}

const DATASET_VERSION_INCLUDE = {
  entries: {
    include: {
      taskRecord: {
        select: {
          taskId: true
        }
      },
      correctionRecord: {
        select: {
          correctionId: true
        }
      }
    }
  }
} as const;

export class DataLoopStorageRepository {
  constructor(private readonly db: StorageDbClient = prisma as unknown as StorageDbClient) {}

  async createTaskRecord(input: CreateTaskRecordInput): Promise<StoredTaskRecord> {
    const taskId = requireNonEmptyString(input.taskId, "taskId");
    const creatorAddress = requireNonEmptyString(input.creatorAddress, "creatorAddress");
    const createdAt = requireDate(input.createdAt, "createdAt");
    const metadataUri = optionalString(input.metadataUri);
    const metadataHash = optionalString(input.metadataHash);

    requireMetadataReference(metadataUri, metadataHash);
    validateChainEventReference(input.chainEvent);

    const existingRecord = await this.db.taskRecord.findUnique({
      where: { taskId }
    });

    if (existingRecord !== null) {
      throw new StorageConflictError(`task record already exists for taskId ${taskId}`);
    }

    const record = await this.db.taskRecord.create({
      data: {
        taskId,
        creatorAddress,
        createdAt,
        metadataUri,
        metadataHash,
        chainId: input.chainEvent?.chainId ?? null,
        contractAddress: input.chainEvent?.contractAddress ?? null,
        transactionHash: input.chainEvent?.transactionHash ?? null,
        blockNumber: input.chainEvent?.blockNumber ?? null,
        logIndex: input.chainEvent?.logIndex ?? null
      }
    });

    return mapTaskRecord(record);
  }

  async saveCorrectionSubmission(input: SaveCorrectionSubmissionInput): Promise<StoredCorrectionRecord> {
    const correctionId = requireNonEmptyString(input.correctionId, "correctionId");
    const taskId = requireNonEmptyString(input.taskId, "taskId");
    const submitterAddress = requireNonEmptyString(input.submitterAddress, "submitterAddress");
    const submittedAt = requireDate(input.submittedAt, "submittedAt");
    const metadataUri = optionalString(input.metadataUri);
    const metadataHash = optionalString(input.metadataHash);

    requireMetadataReference(metadataUri, metadataHash);
    validateChainEventReference(input.chainEvent);

    const [taskRecord, existingCorrection] = await Promise.all([
      this.db.taskRecord.findUnique({ where: { taskId } }),
      this.db.correctionRecord.findUnique({ where: { correctionId } })
    ]);

    if (taskRecord === null) {
      throw new StorageNotFoundError(`task record not found for taskId ${taskId}`);
    }

    if (existingCorrection !== null) {
      throw new StorageConflictError(
        `correction record already exists for correctionId ${correctionId}`
      );
    }

    const record = await this.db.correctionRecord.create({
      data: {
        correctionId,
        taskRecordId: taskRecord.id,
        submitterAddress,
        submittedAt,
        metadataUri,
        metadataHash,
        chainId: input.chainEvent?.chainId ?? null,
        contractAddress: input.chainEvent?.contractAddress ?? null,
        transactionHash: input.chainEvent?.transactionHash ?? null,
        blockNumber: input.chainEvent?.blockNumber ?? null,
        logIndex: input.chainEvent?.logIndex ?? null
      }
    });

    return mapCorrectionRecord(record, taskRecord.taskId);
  }

  async registerDatasetVersion(input: RegisterDatasetVersionInput): Promise<StoredDatasetVersion> {
    const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
    const registeredBy = requireNonEmptyString(input.registeredBy, "registeredBy");
    const registeredAt = requireDate(input.registeredAt, "registeredAt");
    const metadataUri = optionalString(input.metadataUri);
    const metadataHash = optionalString(input.metadataHash);
    const immutableRef = optionalString(input.immutableRef) ?? metadataHash ?? metadataUri;

    if (input.entries.length === 0) {
      throw new StorageValidationError("entries must contain at least one dataset entry");
    }

    requireMetadataReference(metadataUri, metadataHash);
    validateChainEventReference(input.chainEvent);
    ensureUniqueDatasetEntries(input.entries);

    if (immutableRef === null) {
      throw new StorageValidationError("immutableRef, metadataUri, or metadataHash is required");
    }

    return this.db.$transaction(async (tx) => {
      let dataset = await tx.dataset.findUnique({
        where: { datasetId }
      });

      if (dataset === null) {
        dataset = await tx.dataset.create({
          data: {
            datasetId,
            createdBy: registeredBy,
            createdAt: registeredAt,
            metadataUri,
            metadataHash,
            latestVersionNumber: 0
          }
        });
      }

      const entryRows = [];
      for (const [position, entry] of input.entries.entries()) {
        if (entry.sourceType === "TASK") {
          const taskIdValue = requireNonEmptyString(entry.taskId, `entries[${position}].taskId`);
          const taskRecord = await tx.taskRecord.findUnique({
            where: { taskId: taskIdValue }
          });

          if (taskRecord === null) {
            throw new StorageNotFoundError(`task record not found for taskId ${taskIdValue}`);
          }

          entryRows.push({
            sourceType: "TASK" as const,
            position,
            taskRecordId: taskRecord.id,
            correctionRecordId: null,
            metadataUri: optionalString(entry.metadataUri) ?? taskRecord.metadataUri,
            metadataHash: optionalString(entry.metadataHash) ?? taskRecord.metadataHash
          });
          continue;
        }

        const correctionIdValue = requireNonEmptyString(
          entry.correctionId,
          `entries[${position}].correctionId`
        );
        const correctionRecord = await tx.correctionRecord.findUnique({
          where: { correctionId: correctionIdValue }
        });

        if (correctionRecord === null) {
          throw new StorageNotFoundError(
            `correction record not found for correctionId ${correctionIdValue}`
          );
        }

        entryRows.push({
          sourceType: "CORRECTION" as const,
          position,
          taskRecordId: null,
          correctionRecordId: correctionRecord.id,
          metadataUri: optionalString(entry.metadataUri) ?? correctionRecord.metadataUri,
          metadataHash: optionalString(entry.metadataHash) ?? correctionRecord.metadataHash
        });
      }

      const versionRecord = await tx.datasetVersion.create({
        data: {
          datasetRefId: dataset.id,
          versionNumber: dataset.latestVersionNumber + 1,
          registeredBy,
          registeredAt,
          metadataUri,
          metadataHash,
          immutableRef,
          chainId: input.chainEvent?.chainId ?? null,
          contractAddress: input.chainEvent?.contractAddress ?? null,
          transactionHash: input.chainEvent?.transactionHash ?? null,
          blockNumber: input.chainEvent?.blockNumber ?? null,
          logIndex: input.chainEvent?.logIndex ?? null,
          entries: {
            create: entryRows
          }
        },
        include: DATASET_VERSION_INCLUDE
      });

      await tx.dataset.update({
        where: { id: dataset.id },
        data: {
          latestVersionNumber: versionRecord.versionNumber
        }
      });

      return mapDatasetVersion(versionRecord, dataset.datasetId);
    });
  }

  async getTaskById(taskId: string): Promise<StoredTaskRecord | null> {
    const normalizedTaskId = requireNonEmptyString(taskId, "taskId");
    const record = await this.db.taskRecord.findUnique({
      where: { taskId: normalizedTaskId }
    });

    return record === null ? null : mapTaskRecord(record);
  }

  async listCorrectionsForTask(taskId: string): Promise<StoredCorrectionRecord[]> {
    const normalizedTaskId = requireNonEmptyString(taskId, "taskId");
    const taskRecord = await this.db.taskRecord.findUnique({
      where: { taskId: normalizedTaskId }
    });

    if (taskRecord === null) {
      return [];
    }

    const records = await this.db.correctionRecord.findMany({
      where: { taskRecordId: taskRecord.id },
      orderBy: [{ submittedAt: "asc" }, { correctionId: "asc" }]
    });

    return records.map((record) => mapCorrectionRecord(record, taskRecord.taskId));
  }

  async getDatasetById(datasetId: string): Promise<StoredDataset | null> {
    const normalizedDatasetId = requireNonEmptyString(datasetId, "datasetId");
    const record = await this.db.dataset.findUnique({
      where: { datasetId: normalizedDatasetId }
    });

    return record === null ? null : mapDataset(record);
  }

  async getDatasetVersionHistory(datasetId: string): Promise<StoredDatasetVersion[]> {
    const normalizedDatasetId = requireNonEmptyString(datasetId, "datasetId");
    const dataset = await this.db.dataset.findUnique({
      where: { datasetId: normalizedDatasetId }
    });

    if (dataset === null) {
      return [];
    }

    const versions = await this.db.datasetVersion.findMany({
      where: { datasetRefId: dataset.id },
      orderBy: { versionNumber: "asc" },
      include: DATASET_VERSION_INCLUDE
    });

    return versions.map((version) => mapDatasetVersion(version, dataset.datasetId));
  }

  async fetchLatestVersion(datasetId: string): Promise<StoredDatasetVersion | null> {
    const normalizedDatasetId = requireNonEmptyString(datasetId, "datasetId");
    const dataset = await this.db.dataset.findUnique({
      where: { datasetId: normalizedDatasetId }
    });

    if (dataset === null) {
      return null;
    }

    const version = await this.db.datasetVersion.findFirst({
      where: { datasetRefId: dataset.id },
      orderBy: { versionNumber: "desc" },
      include: DATASET_VERSION_INCLUDE
    });

    return version === null ? null : mapDatasetVersion(version, dataset.datasetId);
  }
}

function mapTaskRecord(record: TaskRecordRow): StoredTaskRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    creatorAddress: record.creatorAddress,
    createdAt: record.createdAt,
    metadataUri: record.metadataUri,
    metadataHash: record.metadataHash,
    chainId: record.chainId,
    contractAddress: record.contractAddress,
    transactionHash: record.transactionHash,
    blockNumber: record.blockNumber,
    logIndex: record.logIndex,
    insertedAt: record.insertedAt,
    updatedAt: record.updatedAt
  };
}

function mapCorrectionRecord(
  record: CorrectionRecordRow,
  taskId: string
): StoredCorrectionRecord {
  return {
    id: record.id,
    correctionId: record.correctionId,
    taskId,
    submitterAddress: record.submitterAddress,
    submittedAt: record.submittedAt,
    metadataUri: record.metadataUri,
    metadataHash: record.metadataHash,
    chainId: record.chainId,
    contractAddress: record.contractAddress,
    transactionHash: record.transactionHash,
    blockNumber: record.blockNumber,
    logIndex: record.logIndex,
    insertedAt: record.insertedAt,
    updatedAt: record.updatedAt
  };
}

function mapDataset(record: DatasetRow): StoredDataset {
  return {
    id: record.id,
    datasetId: record.datasetId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    metadataUri: record.metadataUri,
    metadataHash: record.metadataHash,
    latestVersionNumber: record.latestVersionNumber,
    insertedAt: record.insertedAt,
    updatedAt: record.updatedAt
  };
}

function mapDatasetVersion(
  record: DatasetVersionRowWithEntries,
  datasetId: string
): StoredDatasetVersion {
  return {
    id: record.id,
    datasetId,
    versionNumber: record.versionNumber,
    registeredBy: record.registeredBy,
    registeredAt: record.registeredAt,
    metadataUri: record.metadataUri,
    metadataHash: record.metadataHash,
    immutableRef: record.immutableRef,
    chainId: record.chainId,
    contractAddress: record.contractAddress,
    transactionHash: record.transactionHash,
    blockNumber: record.blockNumber,
    logIndex: record.logIndex,
    insertedAt: record.insertedAt,
    entries: [...record.entries]
      .sort((left, right) => left.position - right.position)
      .map(
        (entry): StoredDatasetEntry => ({
          id: entry.id,
          datasetVersionId: entry.datasetVersionId,
          sourceType: entry.sourceType,
          position: entry.position,
          taskId: entry.taskRecord?.taskId ?? null,
          correctionId: entry.correctionRecord?.correctionId ?? null,
          metadataUri: entry.metadataUri,
          metadataHash: entry.metadataHash,
          insertedAt: entry.insertedAt
        })
      )
  };
}
