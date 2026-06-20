const DEFAULT_API_BASE_URL = "http://localhost:3001";

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type AgentArtifactDifficulty = "easy" | "medium" | "hard";
export type AgentArtifactSource = "marketplace" | "upload";
export type AgentProviderMode = "mock" | "external-compute";

export interface AgentArtifactStorageProof {
  provider: "WALRUS";
  status: "prepared" | "stored" | "unavailable";
  contentHash: string;
  blobId: string | null;
  blobObjectId: string | null;
  transactionDigest: string | null;
  uri: string | null;
  network: "testnet" | "mainnet" | null;
  aggregatorUrl: string | null;
  uploadedAt: string | null;
  errorMessage: string | null;
}

export interface AgentArtifactResource {
  id: string;
  title: string;
  domain: "excel" | "sui";
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

export interface AgentComparisonResult {
  raw: AgentAnswerResource;
  augmented: AgentAnswerResource;
  retrievedArtifacts: AgentArtifactResource[];
  run: AgentRunResource;
}

export interface AgentArtifactListResult {
  artifacts: AgentArtifactResource[];
}

export interface AgentLibraryMutationResult {
  artifact: AgentArtifactResource;
  library: AgentArtifactResource[];
}

export interface AgentLibraryRemoveResult {
  artifactId: string;
  removed: boolean;
  library: AgentArtifactResource[];
}

export interface UploadAgentArtifactPayload {
  title: string;
  questionPattern?: string;
  formulaPattern?: string;
  concepts?: string[];
  answer: string;
}

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export async function getAgentMarketplaceArtifacts() {
  return request<AgentArtifactListResult>("/v1/agent/marketplace/artifacts");
}

export async function getAgentLibrary() {
  return request<AgentArtifactListResult>("/v1/agent/library");
}

export async function addAgentArtifactToLibrary(artifactId: string) {
  return request<AgentLibraryMutationResult>("/v1/agent/library/artifacts", {
    method: "POST",
    body: JSON.stringify({ artifactId })
  });
}

export async function removeAgentArtifactFromLibrary(artifactId: string) {
  return request<AgentLibraryRemoveResult>(`/v1/agent/library/artifacts/${artifactId}`, {
    method: "DELETE"
  });
}

export async function uploadAgentArtifact(payload: UploadAgentArtifactPayload) {
  return request<AgentLibraryMutationResult>("/v1/agent/artifacts/upload", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function compareAgentQuestion(question: string) {
  return request<AgentComparisonResult>("/v1/agent/compare", {
    method: "POST",
    body: JSON.stringify({ question })
  });
}

export interface PlatformAgent { id: string; name: string; instructions: string; model: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; enabledTools: string[]; maxSteps: number }
export interface PlatformRun { id: string; status: "RUNNING" | "COMPLETED" | "FAILED"; input: string; output: string | null; error: string | null; steps: Array<{ id: string; kind: string; toolName: string | null; input: unknown; output: unknown; error: string | null; durationMs: number | null }>; citations: Array<{ title: string; url: string; snippet: string }> }

export function createPlatformAgent(payload: { name: string; instructions: string; model?: string; enabledTools: string[]; artifactIds: string[]; maxSteps: number }) {
  return request<PlatformAgent>("/v1/agents", { method: "POST", body: JSON.stringify(payload) });
}
export function updatePlatformAgent(id: string, payload: Partial<PlatformAgent>) {
  return request<PlatformAgent>(`/v1/agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export function runPlatformAgent(id: string, input: string) {
  return request<PlatformRun>(`/v1/agents/${id}/runs`, { method: "POST", body: JSON.stringify({ input }) });
}
export function listPlatformArtifacts() { return request<Array<{ id: string; title: string; domain: string; versions: Array<{ status: string }> }>>("/v1/artifacts"); }
export function submitRunFeedback(runId: string, rating: -1 | 0 | 1, correctedAnswer?: string) {
  return request(`/v1/runs/${runId}/feedback`, { method: "POST", body: JSON.stringify({ rating, correctedAnswer }) });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  const payload = (await response.json()) as { data?: T } | ApiErrorPayload;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    throw new ApiClientError(
      response.status,
      errorPayload.error?.code ?? "API_REQUEST_FAILED",
      errorPayload.error?.message ?? "Request failed",
      errorPayload.error?.details
    );
  }

  return (payload as { data: T }).data;
}
