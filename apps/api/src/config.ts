import type { NodeEnvironment } from "@dataloop/shared";

import type { AgentStorageNetwork } from "./agent/types";

export interface BlockchainConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  signerPrivateKey: string;
}

export interface ApiConfig {
  host: string;
  port: number;
  webOrigin: string | string[];
  databaseUrl: string;
  nodeEnv: NodeEnvironment;
  blockchain: BlockchainConfig;
  agent: AgentRuntimeConfig;
}

export type AgentModelMode = "mock" | "openai-compatible";

export interface AgentRuntimeConfig {
  modelMode: AgentModelMode;
  modelBaseUrl: string | null;
  modelName: string;
  modelApiKey: string | null;
  requestTeeVerification: boolean;
  storage: AgentStorageConfig;
}

export interface AgentStorageConfig {
  enabled: boolean;
  network: AgentStorageNetwork;
  suiRpcUrl: string;
  defaultEpochs: number;
  uploadRelayUrl: string | null;
  publisherUrl: string | null;
  aggregatorUrl: string | null;
  privateKey: string | null;
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  return "development";
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3001");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("API_PORT must be a positive integer");
  }

  return port;
}

function parseChainId(value: string | undefined): number {
  const chainId = Number(value ?? "16661");

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive integer");
  }

  return chainId;
}

function parseAgentModelMode(value: string | undefined): AgentModelMode {
  if (value === "openai-compatible") {
    return value;
  }

  return "mock";
}

function requireEnv(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function optionalEnv(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function parseStorageNetwork(value: string | undefined): AgentStorageNetwork {
  if (value === "mainnet") {
    return "mainnet";
  }

  return "testnet";
}

function parseStorageEpochs(value: string | undefined) {
  const epochs = Number(value ?? "3");

  if (!Number.isInteger(epochs) || epochs <= 0) {
    throw new Error("WALRUS_DEFAULT_EPOCHS must be a positive integer");
  }

  return epochs;
}

function parseWebOrigin(value: string | undefined) {
  const configuredOrigins = (value ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const origins = new Set([...configuredOrigins, "http://localhost:5173", "http://127.0.0.1:5173"]);

  return [...origins];
}

export function getApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const agentModelMode = parseAgentModelMode(env.API_AGENT_MODEL_MODE ?? env.AGENT_MODEL_MODE);
  const storageNetwork = parseStorageNetwork(env.WALRUS_NETWORK);
  const storagePrivateKey = optionalEnv(env.SUI_AGENT_PRIVATE_KEY);
  const publisherUrl = optionalEnv(env.WALRUS_PUBLISHER_URL);

  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: parsePort(env.API_PORT),
    webOrigin: parseWebOrigin(env.WEB_ORIGIN),
    databaseUrl: env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/dataloop",
    nodeEnv: parseNodeEnvironment(env.NODE_ENV),
    blockchain: {
      chainId: parseChainId(env.CHAIN_ID),
      rpcUrl: requireEnv(env.CHAIN_RPC_URL, "CHAIN_RPC_URL"),
      contractAddress: requireEnv(env.DATA_LOOP_CONTRACT_ADDRESS, "DATA_LOOP_CONTRACT_ADDRESS"),
      signerPrivateKey: requireEnv(env.API_SIGNER_PRIVATE_KEY, "API_SIGNER_PRIVATE_KEY")
    },
    agent: {
      modelMode: agentModelMode,
      modelBaseUrl: optionalEnv(env.API_AGENT_MODEL_BASE_URL ?? env.AGENT_MODEL_BASE_URL),
      modelName: optionalEnv(env.API_AGENT_MODEL_NAME ?? env.AGENT_MODEL_NAME) ?? "qwen/qwen-2.5-7b-instruct",
      modelApiKey: optionalEnv(env.API_AGENT_MODEL_API_KEY ?? env.AGENT_MODEL_API_KEY),
      requestTeeVerification: parseBoolean(env.API_AGENT_VERIFY_TEE ?? env.AGENT_VERIFY_TEE),
      storage: {
        enabled: storagePrivateKey !== null || publisherUrl !== null,
        network: storageNetwork,
        suiRpcUrl: optionalEnv(env.SUI_RPC_URL) ?? `https://fullnode.${storageNetwork}.sui.io:443`,
        defaultEpochs: parseStorageEpochs(env.WALRUS_DEFAULT_EPOCHS),
        uploadRelayUrl: optionalEnv(env.WALRUS_UPLOAD_RELAY_URL),
        publisherUrl,
        aggregatorUrl: optionalEnv(env.WALRUS_AGGREGATOR_URL),
        privateKey: storagePrivateKey
      }
    }
  };
}
