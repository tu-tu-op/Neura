export interface ChainEventReference {
  chainId?: number;
  contractAddress?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  logIndex?: number;
}

export interface CreateTaskRecordInput {
  taskId: string;
  creatorAddress: string;
  createdAt: Date;
  metadataUri?: string;
  metadataHash?: string;
  chainEvent?: ChainEventReference;
}

export interface SaveCorrectionSubmissionInput {
  correctionId: string;
  taskId: string;
  submitterAddress: string;
  submittedAt: Date;
  metadataUri?: string;
  metadataHash?: string;
  chainEvent?: ChainEventReference;
}

export type DatasetEntryInput =
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

export interface RegisterDatasetVersionInput {
  datasetId: string;
  registeredBy: string;
  registeredAt: Date;
  metadataUri?: string;
  metadataHash?: string;
  immutableRef?: string;
  chainEvent?: ChainEventReference;
  entries: DatasetEntryInput[];
}

export interface StoredTaskRecord {
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

export interface StoredCorrectionRecord {
  id: string;
  correctionId: string;
  taskId: string;
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

export interface StoredDataset {
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

export interface StoredDatasetEntry {
  id: string;
  datasetVersionId: string;
  sourceType: "TASK" | "CORRECTION";
  position: number;
  taskId: string | null;
  correctionId: string | null;
  metadataUri: string | null;
  metadataHash: string | null;
  insertedAt: Date;
}

export interface StoredDatasetVersion {
  id: string;
  datasetId: string;
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
  entries: StoredDatasetEntry[];
}
