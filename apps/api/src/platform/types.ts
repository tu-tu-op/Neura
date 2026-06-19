export interface TaskResource {
  storageId: string;
  taskId: string;
  creatorAddress: string;
  chainCreatorAddress: string | null;
  createdAt: string;
  metadataUri: string | null;
  metadataHash: string | null;
  chain: {
    chainId: number | null;
    contractAddress: string | null;
    transactionHash: string | null;
    blockNumber: string | null;
    logIndex: number | null;
  };
}

export interface CorrectionResource {
  storageId: string;
  correctionId: string;
  taskId: string;
  submitterAddress: string;
  chainSubmitterAddress: string | null;
  submittedAt: string;
  metadataUri: string | null;
  metadataHash: string | null;
  chain: {
    chainId: number | null;
    contractAddress: string | null;
    transactionHash: string | null;
    blockNumber: string | null;
    logIndex: number | null;
  };
}

export interface DatasetEntryResource {
  id: string;
  datasetVersionId: string;
  sourceType: "TASK" | "CORRECTION";
  position: number;
  taskId: string | null;
  correctionId: string | null;
  metadataUri: string | null;
  metadataHash: string | null;
  insertedAt: string;
}

export interface DatasetSummaryResource {
  storageId: string;
  datasetId: string;
  createdBy: string;
  createdAt: string;
  metadataUri: string | null;
  metadataHash: string | null;
  latestVersionNumber: number;
}

export interface DatasetVersionResource {
  storageId: string;
  datasetId: string;
  versionNumber: number;
  registeredBy: string;
  chainRegistrarAddress: string | null;
  registeredAt: string;
  metadataUri: string | null;
  metadataHash: string | null;
  immutableRef: string;
  entries: DatasetEntryResource[];
  chain: {
    chainId: number | null;
    contractAddress: string | null;
    transactionHash: string | null;
    blockNumber: string | null;
    logIndex: number | null;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CreateTaskRequest {
  taskId: string;
  creatorAddress: string;
  metadataUri?: string;
  metadataHash?: string;
  stakeAmountWei?: string;
}

export interface SubmitCorrectionRequest {
  submitterAddress: string;
  metadataUri?: string;
  metadataHash?: string;
  stakeAmountWei?: string;
}

export type DatasetEntryRequest =
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
    };

export interface RegisterDatasetVersionRequest {
  registeredBy: string;
  metadataUri?: string;
  metadataHash?: string;
  immutableRef?: string;
  entries: DatasetEntryRequest[];
}

export interface CreateTaskResult {
  task: TaskResource;
  contractTaskId: string;
  stakeId: string | null;
}

export interface SubmitCorrectionResult {
  correction: CorrectionResource;
  stakeId: string | null;
}

export interface RegisterDatasetVersionResult {
  dataset: DatasetSummaryResource;
  version: DatasetVersionResource;
}

export interface TaskWithCorrectionsResult {
  task: TaskResource;
  corrections: CorrectionResource[];
}

export interface DatasetHistoryResult {
  dataset: DatasetSummaryResource;
  versions: DatasetVersionResource[];
}
