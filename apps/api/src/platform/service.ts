import {
  DataLoopStorageRepository,
  StorageConflictError,
  StorageNotFoundError,
  StorageValidationError,
  type DatasetEntryInput,
  type RegisterDatasetVersionInput,
  type StoredCorrectionRecord,
  type StoredDataset,
  type StoredDatasetVersion,
  type StoredTaskRecord
} from "@dataloop/storage";

import type { ApiConfig } from "../config";
import { ApiError, BlockchainError } from "../errors";
import {
  EthersDataLoopChainClient,
  type CreateTaskChainResult,
  type DataLoopChainClient,
  type RegisterDatasetVersionChainResult,
  type SubmitCorrectionChainResult
} from "./blockchain";
import type {
  CorrectionResource,
  CreateTaskRequest,
  CreateTaskResult,
  DatasetHistoryResult,
  DatasetSummaryResource,
  DatasetVersionResource,
  RegisterDatasetVersionRequest,
  RegisterDatasetVersionResult,
  SubmitCorrectionRequest,
  SubmitCorrectionResult,
  TaskResource,
  TaskWithCorrectionsResult
} from "./types";

export interface StoragePort {
  createTaskRecord(input: {
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
  }): Promise<StoredTaskRecord>;
  saveCorrectionSubmission(input: {
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
  }): Promise<StoredCorrectionRecord>;
  registerDatasetVersion(input: RegisterDatasetVersionInput): Promise<StoredDatasetVersion>;
  getTaskById(taskId: string): Promise<StoredTaskRecord | null>;
  listCorrectionsForTask(taskId: string): Promise<StoredCorrectionRecord[]>;
  getDatasetById(datasetId: string): Promise<StoredDataset | null>;
  getDatasetVersionHistory(datasetId: string): Promise<StoredDatasetVersion[]>;
  fetchLatestVersion(datasetId: string): Promise<StoredDatasetVersion | null>;
}

export class BasePlatformService {
  constructor(
    private readonly chainClient: DataLoopChainClient,
    private readonly storage: StoragePort
  ) {}

  async createTask(request: CreateTaskRequest): Promise<CreateTaskResult> {
    const existingTask = await this.storage.getTaskById(request.taskId);
    if (existingTask !== null) {
      throw new ApiError(409, "TASK_ALREADY_EXISTS", `task ${request.taskId} already exists`);
    }

    try {
      const chainTask = await this.chainClient.createTask({
        taskId: request.taskId,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash),
        ...optionalStringField("stakeAmountWei", request.stakeAmountWei)
      });

      const storedTask = await this.storage.createTaskRecord({
        taskId: request.taskId,
        creatorAddress: request.creatorAddress,
        createdAt: chainTask.createdAt,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash),
        chainEvent: toStorageChainEvent(chainTask)
      });

      return {
        task: mapTaskResource(storedTask, chainTask.creatorAddress),
        contractTaskId: chainTask.taskId,
        stakeId: chainTask.stakeId
      };
    } catch (error) {
      throw mapDomainError(error);
    }
  }

  async submitCorrection(taskId: string, request: SubmitCorrectionRequest): Promise<SubmitCorrectionResult> {
    const task = await this.storage.getTaskById(taskId);
    if (task === null) {
      throw new ApiError(404, "TASK_NOT_FOUND", `task ${taskId} was not found`);
    }

    try {
      const chainCorrection = await this.chainClient.submitCorrection({
        taskId,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash),
        ...optionalStringField("stakeAmountWei", request.stakeAmountWei)
      });

      const storedCorrection = await this.storage.saveCorrectionSubmission({
        correctionId: chainCorrection.correctionId,
        taskId,
        submitterAddress: request.submitterAddress,
        submittedAt: chainCorrection.submittedAt,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash),
        chainEvent: toStorageChainEvent(chainCorrection)
      });

      return {
        correction: mapCorrectionResource(storedCorrection, chainCorrection.submitterAddress),
        stakeId: chainCorrection.stakeId
      };
    } catch (error) {
      throw mapDomainError(error);
    }
  }

  async registerDatasetVersion(
    datasetId: string,
    request: RegisterDatasetVersionRequest
  ): Promise<RegisterDatasetVersionResult> {
    try {
      const chainVersion = await this.chainClient.registerDatasetVersion({
        datasetId,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash)
      });

      const storedVersion = await this.storage.registerDatasetVersion({
        datasetId,
        registeredBy: request.registeredBy,
        registeredAt: chainVersion.registeredAt,
        ...optionalStringField("metadataUri", request.metadataUri),
        ...optionalStringField("metadataHash", request.metadataHash),
        ...optionalStringField("immutableRef", request.immutableRef),
        entries: request.entries as DatasetEntryInput[],
        chainEvent: toStorageChainEvent(chainVersion)
      });

      const dataset = await this.storage.getDatasetById(datasetId);
      if (dataset === null) {
        throw new ApiError(500, "DATASET_WRITE_FAILED", `dataset ${datasetId} was not persisted`);
      }

      return {
        dataset: mapDatasetSummary(dataset),
        version: mapDatasetVersionResource(storedVersion, chainVersion.registrarAddress)
      };
    } catch (error) {
      throw mapDomainError(error);
    }
  }

  async getTask(taskId: string): Promise<TaskResource> {
    const task = await this.storage.getTaskById(taskId);
    if (task === null) {
      throw new ApiError(404, "TASK_NOT_FOUND", `task ${taskId} was not found`);
    }

    return mapTaskResource(task, null);
  }

  async getCorrectionsForTask(taskId: string): Promise<TaskWithCorrectionsResult> {
    const task = await this.storage.getTaskById(taskId);
    if (task === null) {
      throw new ApiError(404, "TASK_NOT_FOUND", `task ${taskId} was not found`);
    }

    const corrections = await this.storage.listCorrectionsForTask(taskId);

    return {
      task: mapTaskResource(task, null),
      corrections: corrections.map((correction) => mapCorrectionResource(correction, null))
    };
  }

  async getDatasetHistory(datasetId: string): Promise<DatasetHistoryResult> {
    const dataset = await this.storage.getDatasetById(datasetId);
    if (dataset === null) {
      throw new ApiError(404, "DATASET_NOT_FOUND", `dataset ${datasetId} was not found`);
    }

    const versions = await this.storage.getDatasetVersionHistory(datasetId);

    return {
      dataset: mapDatasetSummary(dataset),
      versions: versions.map((version) => mapDatasetVersionResource(version, null))
    };
  }

  async getLatestDatasetVersion(datasetId: string): Promise<RegisterDatasetVersionResult> {
    const dataset = await this.storage.getDatasetById(datasetId);
    if (dataset === null) {
      throw new ApiError(404, "DATASET_NOT_FOUND", `dataset ${datasetId} was not found`);
    }

    const latestVersion = await this.storage.fetchLatestVersion(datasetId);
    if (latestVersion === null) {
      throw new ApiError(
        404,
        "DATASET_VERSION_NOT_FOUND",
        `dataset ${datasetId} does not have a registered version`
      );
    }

    return {
      dataset: mapDatasetSummary(dataset),
      version: mapDatasetVersionResource(latestVersion, null)
    };
  }
}

export function createBasePlatformService(config: ApiConfig) {
  return new BasePlatformService(
    new EthersDataLoopChainClient(config.blockchain),
    new DataLoopStorageRepository()
  );
}

function mapDomainError(error: unknown): Error {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof StorageValidationError) {
    return new ApiError(400, "INVALID_STORAGE_WRITE", error.message);
  }

  if (error instanceof StorageConflictError) {
    return new ApiError(409, "STORAGE_CONFLICT", error.message);
  }

  if (error instanceof StorageNotFoundError) {
    return new ApiError(404, "RELATED_RECORD_NOT_FOUND", error.message);
  }

  if (error instanceof BlockchainError) {
    return new ApiError(502, "BLOCKCHAIN_WRITE_FAILED", error.message, error.details);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("unknown application error");
}

function mapTaskResource(task: StoredTaskRecord, chainCreatorAddress: string | null): TaskResource {
  return {
    storageId: task.id,
    taskId: task.taskId,
    creatorAddress: task.creatorAddress,
    chainCreatorAddress,
    createdAt: task.createdAt.toISOString(),
    metadataUri: task.metadataUri,
    metadataHash: task.metadataHash,
    chain: {
      chainId: task.chainId,
      contractAddress: task.contractAddress,
      transactionHash: task.transactionHash,
      blockNumber: task.blockNumber?.toString() ?? null,
      logIndex: task.logIndex
    }
  };
}

function mapCorrectionResource(
  correction: StoredCorrectionRecord,
  chainSubmitterAddress: string | null
): CorrectionResource {
  return {
    storageId: correction.id,
    correctionId: correction.correctionId,
    taskId: correction.taskId,
    submitterAddress: correction.submitterAddress,
    chainSubmitterAddress,
    submittedAt: correction.submittedAt.toISOString(),
    metadataUri: correction.metadataUri,
    metadataHash: correction.metadataHash,
    chain: {
      chainId: correction.chainId,
      contractAddress: correction.contractAddress,
      transactionHash: correction.transactionHash,
      blockNumber: correction.blockNumber?.toString() ?? null,
      logIndex: correction.logIndex
    }
  };
}

function mapDatasetSummary(dataset: StoredDataset): DatasetSummaryResource {
  return {
    storageId: dataset.id,
    datasetId: dataset.datasetId,
    createdBy: dataset.createdBy,
    createdAt: dataset.createdAt.toISOString(),
    metadataUri: dataset.metadataUri,
    metadataHash: dataset.metadataHash,
    latestVersionNumber: dataset.latestVersionNumber
  };
}

function mapDatasetVersionResource(
  version: StoredDatasetVersion,
  chainRegistrarAddress: string | null
): DatasetVersionResource {
  return {
    storageId: version.id,
    datasetId: version.datasetId,
    versionNumber: version.versionNumber,
    registeredBy: version.registeredBy,
    chainRegistrarAddress,
    registeredAt: version.registeredAt.toISOString(),
    metadataUri: version.metadataUri,
    metadataHash: version.metadataHash,
    immutableRef: version.immutableRef,
    entries: version.entries.map((entry) => ({
      id: entry.id,
      datasetVersionId: entry.datasetVersionId,
      sourceType: entry.sourceType,
      position: entry.position,
      taskId: entry.taskId,
      correctionId: entry.correctionId,
      metadataUri: entry.metadataUri,
      metadataHash: entry.metadataHash,
      insertedAt: entry.insertedAt.toISOString()
    })),
    chain: {
      chainId: version.chainId,
      contractAddress: version.contractAddress,
      transactionHash: version.transactionHash,
      blockNumber: version.blockNumber?.toString() ?? null,
      logIndex: version.logIndex
    }
  };
}

function toStorageChainEvent(
  chainResult:
    | CreateTaskChainResult
    | SubmitCorrectionChainResult
    | RegisterDatasetVersionChainResult
) {
  return {
    chainId: chainResult.chainId,
    contractAddress: chainResult.contractAddress,
    transactionHash: chainResult.transactionHash,
    blockNumber: chainResult.blockNumber,
    logIndex: chainResult.logIndex
  };
}

function optionalStringField<T extends string>(key: T, value: string | undefined) {
  if (value === undefined) {
    return {};
  }

  return {
    [key]: value
  } as Record<T, string>;
}
