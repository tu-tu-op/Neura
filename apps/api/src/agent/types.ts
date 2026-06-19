export type AgentArtifactDifficulty = "easy" | "medium" | "hard";
export type AgentArtifactSource = "marketplace" | "upload";
export type AgentArtifactDomain = "excel" | "sui";
export type AgentStorageStatus = "prepared" | "stored" | "unavailable";
export type AgentProviderMode = "mock" | "external-compute";
export type AgentStorageNetwork = "testnet" | "mainnet";

export interface AgentArtifactStorageProof {
  provider: "WALRUS";
  status: AgentStorageStatus;
  contentHash: string;
  blobId: string | null;
  blobObjectId: string | null;
  transactionDigest: string | null;
  uri: string | null;
  network: AgentStorageNetwork | null;
  aggregatorUrl: string | null;
  uploadedAt: string | null;
  errorMessage: string | null;
}

export interface AgentArtifactResource {
  id: string;
  title: string;
  domain: AgentArtifactDomain;
  difficulty: AgentArtifactDifficulty;
  tags: string[];
  questionPattern: string;
  formulaPattern: string;
  concepts: string[];
  answer: string;
  rawFormula: string | null;
  rawAnswer: string;
  source: AgentArtifactSource;
  creator: string;
  version: string;
  usageCount: number;
  benchmarkScore: number | null;
  createdAt: string;
  updatedAt: string;
  storage: AgentArtifactStorageProof;
}

export interface AgentProviderStatus {
  mode: AgentProviderMode;
  modelName: string;
  baseUrl: string | null;
  traceId: string | null;
  teeVerificationRequested: boolean;
  teeVerified: boolean | null;
  errorMessage: string | null;
}

export interface AgentAnswerResource {
  label: "Raw LLM" | "With Artifacts";
  formula: string;
  explanation: string;
  confidence: number;
  artifactIds: string[];
  matchedArtifactTitle: string;
  provider: AgentProviderStatus;
}

export interface AgentRunResource {
  id: string;
  createdAt: string;
  question: string;
  retrievedArtifactIds: string[];
  storageProvider: "WALRUS";
  rawProvider: AgentProviderStatus;
  augmentedProvider: AgentProviderStatus;
}

export interface AgentComparisonResource {
  raw: AgentAnswerResource;
  augmented: AgentAnswerResource;
  retrievedArtifacts: AgentArtifactResource[];
  run: AgentRunResource;
}

export interface AgentUploadArtifactRequest {
  title: string;
  questionPattern?: string;
  formulaPattern?: string;
  concepts?: string[];
  answer: string;
}

export interface AgentCompareRequest {
  question: string;
}
