import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroHash,
  isAddress
} from "ethers";

import type { BlockchainConfig } from "../config";
import { ApiError, BlockchainError } from "../errors";

const DATA_LOOP_CORE_ABI = [
  "function createTask(bytes32 taskId, string metadataURI, bytes32 metadataHash) payable returns (uint256 stakeId)",
  "function submitCorrection(bytes32 taskId, string metadataURI, bytes32 metadataHash) payable returns (uint256 correctionId, uint256 stakeId)",
  "function registerDatasetVersion(bytes32 datasetId, string metadataURI, bytes32 metadataHash) returns (uint256 version)",
  "event TaskCreated(bytes32 indexed taskId, address indexed creator, uint64 timestamp, string metadataURI, bytes32 metadataHash)",
  "event CorrectionSubmitted(uint256 indexed correctionId, bytes32 indexed taskId, address indexed submitter, uint64 timestamp, string metadataURI, bytes32 metadataHash)",
  "event DatasetRegistered(bytes32 indexed datasetId, uint256 indexed version, address indexed registrar, uint64 timestamp, string metadataURI, bytes32 metadataHash)",
  "event StakeDeposited(uint256 indexed stakeId, address indexed staker, uint8 indexed referenceType, bytes32 taskId, uint256 correctionId, uint256 amount, uint64 lockedAt)"
] as const;

interface ChainEventReference {
  chainId: number;
  contractAddress: string;
  transactionHash: string;
  blockNumber: bigint;
  logIndex: number;
}

export interface CreateTaskChainResult extends ChainEventReference {
  taskId: string;
  creatorAddress: string;
  createdAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  stakeId: string | null;
}

export interface SubmitCorrectionChainResult extends ChainEventReference {
  correctionId: string;
  taskId: string;
  submitterAddress: string;
  submittedAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
  stakeId: string | null;
}

export interface RegisterDatasetVersionChainResult extends ChainEventReference {
  datasetId: string;
  versionNumber: number;
  registrarAddress: string;
  registeredAt: Date;
  metadataUri: string | null;
  metadataHash: string | null;
}

export interface DataLoopChainClient {
  createTask(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<CreateTaskChainResult>;
  submitCorrection(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<SubmitCorrectionChainResult>;
  registerDatasetVersion(input: {
    datasetId: string;
    metadataUri?: string;
    metadataHash?: string;
  }): Promise<RegisterDatasetVersionChainResult>;
}

export class EthersDataLoopChainClient implements DataLoopChainClient {
  private readonly provider: JsonRpcProvider;
  private readonly signer: Wallet;
  private readonly contract: Contract;
  private readonly contractInterface = new Interface(DATA_LOOP_CORE_ABI);

  constructor(private readonly config: BlockchainConfig) {
    if (!isAddress(config.contractAddress)) {
      throw new ApiError(500, "INVALID_BLOCKCHAIN_CONFIG", "DATA_LOOP_CONTRACT_ADDRESS is invalid");
    }

    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.signer = new Wallet(config.signerPrivateKey, this.provider);
    this.contract = new Contract(config.contractAddress, DATA_LOOP_CORE_ABI, this.signer);
  }

  async createTask(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<CreateTaskChainResult> {
    try {
      const tx = await (this.contract as Contract & {
        createTask: (
          taskId: string,
          metadataUri: string,
          metadataHash: string,
          overrides: object
        ) => Promise<{ wait: () => Promise<{ hash: string; blockNumber: number; logs: unknown[] } | null> }>;
      }).createTask(
        input.taskId,
        input.metadataUri ?? "",
        input.metadataHash ?? ZeroHash,
        buildOverrides(input.stakeAmountWei)
      );
      const receipt = await tx.wait();

      if (receipt === null) {
        throw new BlockchainError("task transaction was not mined");
      }

      const taskEvent = this.findEvent(receipt.logs, "TaskCreated");
      const stakeEvent = this.findEvent(receipt.logs, "StakeDeposited");

      return {
        taskId: String(readRequiredEventArg(taskEvent.args, "taskId")),
        creatorAddress: String(readRequiredEventArg(taskEvent.args, "creator")),
        createdAt: toDate(readRequiredEventArg(taskEvent.args, "timestamp")),
        metadataUri: normalizeOptionalString(String(readRequiredEventArg(taskEvent.args, "metadataURI"))),
        metadataHash: normalizeHash(String(readRequiredEventArg(taskEvent.args, "metadataHash"))),
        stakeId:
          stakeEvent === null ? null : String(readRequiredEventArg(stakeEvent.args, "stakeId")),
        ...this.toChainReference(receipt, taskEvent.logIndex)
      };
    } catch (error) {
      throw toBlockchainError("createTask", error);
    }
  }

  async submitCorrection(input: {
    taskId: string;
    metadataUri?: string;
    metadataHash?: string;
    stakeAmountWei?: string;
  }): Promise<SubmitCorrectionChainResult> {
    try {
      const tx = await (this.contract as Contract & {
        submitCorrection: (
          taskId: string,
          metadataUri: string,
          metadataHash: string,
          overrides: object
        ) => Promise<{ wait: () => Promise<{ hash: string; blockNumber: number; logs: unknown[] } | null> }>;
      }).submitCorrection(
        input.taskId,
        input.metadataUri ?? "",
        input.metadataHash ?? ZeroHash,
        buildOverrides(input.stakeAmountWei)
      );
      const receipt = await tx.wait();

      if (receipt === null) {
        throw new BlockchainError("correction transaction was not mined");
      }

      const correctionEvent = this.findEvent(receipt.logs, "CorrectionSubmitted");
      const stakeEvent = this.findEvent(receipt.logs, "StakeDeposited");

      return {
        correctionId: String(readRequiredEventArg(correctionEvent.args, "correctionId")),
        taskId: String(readRequiredEventArg(correctionEvent.args, "taskId")),
        submitterAddress: String(readRequiredEventArg(correctionEvent.args, "submitter")),
        submittedAt: toDate(readRequiredEventArg(correctionEvent.args, "timestamp")),
        metadataUri: normalizeOptionalString(String(readRequiredEventArg(correctionEvent.args, "metadataURI"))),
        metadataHash: normalizeHash(String(readRequiredEventArg(correctionEvent.args, "metadataHash"))),
        stakeId:
          stakeEvent === null ? null : String(readRequiredEventArg(stakeEvent.args, "stakeId")),
        ...this.toChainReference(receipt, correctionEvent.logIndex)
      };
    } catch (error) {
      throw toBlockchainError("submitCorrection", error);
    }
  }

  async registerDatasetVersion(input: {
    datasetId: string;
    metadataUri?: string;
    metadataHash?: string;
  }): Promise<RegisterDatasetVersionChainResult> {
    try {
      const tx = await (this.contract as Contract & {
        registerDatasetVersion: (
          datasetId: string,
          metadataUri: string,
          metadataHash: string
        ) => Promise<{ wait: () => Promise<{ hash: string; blockNumber: number; logs: unknown[] } | null> }>;
      }).registerDatasetVersion(
        input.datasetId,
        input.metadataUri ?? "",
        input.metadataHash ?? ZeroHash
      );
      const receipt = await tx.wait();

      if (receipt === null) {
        throw new BlockchainError("dataset transaction was not mined");
      }

      const datasetEvent = this.findEvent(receipt.logs, "DatasetRegistered");

      return {
        datasetId: String(readRequiredEventArg(datasetEvent.args, "datasetId")),
        versionNumber: Number(readRequiredEventArg(datasetEvent.args, "version")),
        registrarAddress: String(readRequiredEventArg(datasetEvent.args, "registrar")),
        registeredAt: toDate(readRequiredEventArg(datasetEvent.args, "timestamp")),
        metadataUri: normalizeOptionalString(String(readRequiredEventArg(datasetEvent.args, "metadataURI"))),
        metadataHash: normalizeHash(String(readRequiredEventArg(datasetEvent.args, "metadataHash"))),
        ...this.toChainReference(receipt, datasetEvent.logIndex)
      };
    } catch (error) {
      throw toBlockchainError("registerDatasetVersion", error);
    }
  }

  private findEvent(logs: readonly unknown[], eventName: string) {
    for (const candidate of logs) {
      if (candidate === null || typeof candidate !== "object" || !("topics" in candidate) || !("data" in candidate)) {
        continue;
      }

      try {
        const parsedLog = this.contractInterface.parseLog({
          topics: (candidate as { topics: string[] }).topics,
          data: String((candidate as { data: string }).data)
        });

        if (parsedLog?.name === eventName) {
          return {
            args: parsedLog.args as Record<string, unknown>,
            logIndex: readLogIndex(candidate)
          };
        }
      } catch {
        continue;
      }
    }

    throw new BlockchainError(`expected ${eventName} event was not found in receipt logs`);
  }

  private toChainReference(receipt: { hash: string; blockNumber: number }, logIndex: number): ChainEventReference {
    return {
      chainId: this.config.chainId,
      contractAddress: this.config.contractAddress,
      transactionHash: receipt.hash,
      blockNumber: BigInt(receipt.blockNumber),
      logIndex
    };
  }
}

function buildOverrides(stakeAmountWei: string | undefined) {
  if (stakeAmountWei === undefined) {
    return {};
  }

  return {
    value: BigInt(stakeAmountWei)
  };
}

function normalizeOptionalString(value: string): string | null {
  return value.length === 0 ? null : value;
}

function normalizeHash(value: string): string | null {
  return value === ZeroHash ? null : value;
}

function toDate(timestamp: bigint | string) {
  const numericTimestamp = typeof timestamp === "bigint" ? timestamp : BigInt(timestamp);
  return new Date(Number(numericTimestamp) * 1000);
}

function toBlockchainError(action: string, error: unknown) {
  if (error instanceof ApiError || error instanceof BlockchainError) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : `unknown blockchain error during ${action}`;

  return new BlockchainError(message, error);
}

function readRequiredEventArg(args: Record<string, unknown>, key: string): string | bigint {
  const value = args[key];

  if (typeof value === "string" || typeof value === "bigint") {
    return value;
  }

  throw new BlockchainError(`missing ${key} in blockchain event`);
}

function readLogIndex(log: unknown) {
  if (typeof log === "object" && log !== null && "index" in log && typeof log.index === "number") {
    return log.index;
  }

  return 0;
}
