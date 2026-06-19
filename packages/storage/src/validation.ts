import { StorageValidationError } from "./errors";
import type { ChainEventReference, DatasetEntryInput } from "./types";

const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export function requireNonEmptyString(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StorageValidationError(`${fieldName} is required`);
  }

  return normalized;
}

export function optionalString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function requireDate(value: Date, fieldName: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new StorageValidationError(`${fieldName} must be a valid Date`);
  }

  return value;
}

export function requireMetadataReference(metadataUri: string | null, metadataHash: string | null) {
  if (metadataUri === null && metadataHash === null) {
    throw new StorageValidationError("metadataUri or metadataHash is required");
  }
}

export function validateChainEventReference(reference: ChainEventReference | undefined) {
  if (reference === undefined) {
    return;
  }

  if (reference.chainId !== undefined && (!Number.isInteger(reference.chainId) || reference.chainId <= 0)) {
    throw new StorageValidationError("chainEvent.chainId must be a positive integer");
  }

  if (
    reference.contractAddress !== undefined &&
    !ETHEREUM_ADDRESS_PATTERN.test(reference.contractAddress)
  ) {
    throw new StorageValidationError("chainEvent.contractAddress must be a valid 0x address");
  }

  if (
    reference.transactionHash !== undefined &&
    !TRANSACTION_HASH_PATTERN.test(reference.transactionHash)
  ) {
    throw new StorageValidationError("chainEvent.transactionHash must be a valid 32-byte hash");
  }

  if (reference.blockNumber !== undefined && reference.blockNumber < 0n) {
    throw new StorageValidationError("chainEvent.blockNumber must be non-negative");
  }

  if (reference.logIndex !== undefined && (!Number.isInteger(reference.logIndex) || reference.logIndex < 0)) {
    throw new StorageValidationError("chainEvent.logIndex must be a non-negative integer");
  }
}

export function ensureUniqueDatasetEntries(entries: DatasetEntryInput[]) {
  const seen = new Set<string>();

  for (const entry of entries) {
    const key =
      entry.sourceType === "TASK"
        ? `TASK:${entry.taskId.trim()}`
        : `CORRECTION:${entry.correctionId.trim()}`;

    if (seen.has(key)) {
      throw new StorageValidationError(`duplicate dataset entry reference: ${key}`);
    }

    seen.add(key);
  }
}
