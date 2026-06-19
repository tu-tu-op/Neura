import { randomUUID } from "node:crypto";

import type { AgentRuntimeConfig } from "../config";
import { ApiError } from "../errors";
import {
  excelArtifactCases,
  marketplaceArtifacts,
  suiArtifactCases,
  type KnowledgeArtifactCase
} from "./marketplace";
import { AgentArtifactStorage } from "./storage";
import type {
  AgentAnswerResource,
  AgentArtifactResource,
  AgentCompareRequest,
  AgentComparisonResource,
  AgentProviderStatus,
  AgentRunResource,
  AgentUploadArtifactRequest
} from "./types";

interface ModelAnswer {
  formula: string;
  explanation: string;
  confidence: number;
  provider: AgentProviderStatus;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  request_id?: string;
  tee_verified?: boolean;
}

interface ParsedModelContent {
  formula?: unknown;
  explanation?: unknown;
  confidence?: unknown;
}

export class AgentService {
  private readonly artifactsById = new Map<string, AgentArtifactResource>();
  private readonly artifactStorage: AgentArtifactStorage;
  private libraryIds = ["excel"];
  private lastComputeRequestAt = 0;

  constructor(private readonly config: AgentRuntimeConfig) {
    this.artifactStorage = new AgentArtifactStorage(config.storage);

    for (const artifact of marketplaceArtifacts) {
      this.artifactsById.set(artifact.id, artifact);
    }
  }

  listMarketplaceArtifacts() {
    return [...this.artifactsById.values()]
      .filter((artifact) => artifact.source === "marketplace")
      .sort((left, right) => right.usageCount - left.usageCount);
  }

  listLibraryArtifacts() {
    return this.libraryIds
      .map((artifactId) => this.artifactsById.get(artifactId))
      .filter((artifact): artifact is AgentArtifactResource => artifact !== undefined);
  }

  addArtifactToLibrary(artifactId: string) {
    const artifact = this.artifactsById.get(artifactId);

    if (artifact === undefined) {
      throw new ApiError(404, "ARTIFACT_NOT_FOUND", `Artifact ${artifactId} was not found`);
    }

    this.libraryIds = [artifactId, ...this.libraryIds.filter((candidate) => candidate !== artifactId)].slice(0, 24);

    return {
      artifact,
      library: this.listLibraryArtifacts()
    };
  }

  removeArtifactFromLibrary(artifactId: string) {
    const previousLength = this.libraryIds.length;
    this.libraryIds = this.libraryIds.filter((candidate) => candidate !== artifactId);

    if (previousLength === this.libraryIds.length) {
      throw new ApiError(404, "ARTIFACT_NOT_IN_LIBRARY", `Artifact ${artifactId} is not in the library`);
    }

    return {
      artifactId,
      removed: true,
      library: this.listLibraryArtifacts()
    };
  }

  async uploadArtifact(input: AgentUploadArtifactRequest) {
    const title = input.title.trim();
    const answer = input.answer.trim();

    if (title.length === 0 || answer.length === 0) {
      throw new ApiError(400, "INVALID_AGENT_ARTIFACT", "Uploaded artifacts require a title and answer");
    }

    const concepts = (input.concepts ?? [])
      .map((concept) => concept.trim())
      .filter((concept) => concept.length > 0)
      .slice(0, 12);
    const artifactId = `upload-${randomUUID()}`;
    const now = new Date().toISOString();
    const artifactContent = {
      title,
      questionPattern: input.questionPattern?.trim() ?? title,
      formulaPattern: input.formulaPattern?.trim() ?? "",
      concepts,
      answer
    };
    const storage = await this.artifactStorage.storeArtifact({
      artifactId,
      content: artifactContent
    });

    const artifact: AgentArtifactResource = {
      id: artifactId,
      title,
      domain: "excel",
      difficulty: "medium",
      tags: concepts.slice(0, 6),
      questionPattern: artifactContent.questionPattern,
      formulaPattern: artifactContent.formulaPattern,
      concepts,
      answer,
      rawFormula: null,
      rawAnswer: "The raw model does not have this uploaded artifact in context.",
      source: "upload",
      creator: "Current user",
      version: "1.0.0",
      usageCount: 1,
      benchmarkScore: null,
      createdAt: now,
      updatedAt: now,
      storage
    };

    this.artifactsById.set(artifact.id, artifact);
    this.libraryIds = [artifact.id, ...this.libraryIds.filter((candidate) => candidate !== artifact.id)].slice(0, 24);

    return {
      artifact,
      library: this.listLibraryArtifacts()
    };
  }

  async compare(input: AgentCompareRequest): Promise<AgentComparisonResource> {
    const question = input.question.trim();

    if (question.length === 0) {
      throw new ApiError(400, "INVALID_AGENT_QUESTION", "Question is required");
    }

    const marketplaceMatch = findBestArtifact(question, this.listMarketplaceArtifacts());
    const libraryMatch = findBestArtifact(question, this.listLibraryArtifacts());
    const rawModelAnswer = await this.answerRawQuestion(question, marketplaceMatch);
    const augmentedModelAnswer =
      libraryMatch === null
        ? this.answerWithoutArtifact()
        : await this.answerWithArtifact(question, libraryMatch);

    const raw: AgentAnswerResource = {
      label: "Raw LLM",
      formula: rawModelAnswer.formula,
      explanation: rawModelAnswer.explanation,
      confidence: rawModelAnswer.confidence,
      artifactIds: [],
      matchedArtifactTitle: marketplaceMatch?.title ?? "General response",
      provider: rawModelAnswer.provider
    };
    const augmented: AgentAnswerResource = {
      label: "With Artifacts",
      formula: augmentedModelAnswer.formula,
      explanation: augmentedModelAnswer.explanation,
      confidence: augmentedModelAnswer.confidence,
      artifactIds: libraryMatch === null ? [] : [libraryMatch.id],
      matchedArtifactTitle: libraryMatch?.title ?? "Library context unavailable",
      provider: augmentedModelAnswer.provider
    };
    const run: AgentRunResource = {
      id: `agent-run-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      question,
      retrievedArtifactIds: augmented.artifactIds,
      storageProvider: "WALRUS",
      rawProvider: raw.provider,
      augmentedProvider: augmented.provider
    };

    return {
      raw,
      augmented,
      retrievedArtifacts: libraryMatch === null ? [] : [libraryMatch],
      run
    };
  }

  private async answerRawQuestion(
    question: string,
    marketplaceMatch: AgentArtifactResource | null
  ): Promise<ModelAnswer> {
    const matchedCase = findBestArtifactCase(question, marketplaceMatch)?.artifactCase ?? null;
    const fallback: ModelAnswer = {
      formula: matchedCase?.rawFormula ?? marketplaceMatch?.rawFormula ?? "",
      explanation:
        matchedCase?.rawAnswer ??
        marketplaceMatch?.rawAnswer ??
        "The raw model gives a general answer, but no curated artifact is available for this exact pattern.",
      confidence: marketplaceMatch === null ? 0.58 : 0.74,
      provider: this.mockProviderStatus()
    };

    return this.callConfiguredModel(
      [
        "You are a concise technical Q&A assistant.",
        "Answer as JSON with formula, explanation, and confidence fields.",
        "Leave formula empty unless the user explicitly asks for a formula or command.",
        "Do not use private artifact context."
      ].join(" "),
      question,
      fallback
    );
  }

  private async answerWithArtifact(question: string, artifact: AgentArtifactResource): Promise<ModelAnswer> {
    const artifactMatch = findBestArtifactCase(question, artifact);
    const matchedCase = artifactMatch?.artifactCase ?? null;
    const fallback: ModelAnswer = {
      formula: matchedCase?.formulaPattern ?? artifact.formulaPattern,
      explanation: matchedCase?.answer ?? artifact.answer,
      confidence: 0.93,
      provider: this.mockProviderStatus()
    };

    return this.callConfiguredModel(
      [
        "You are a concise technical Q&A assistant.",
        "Use the provided DataLoop artifact as the primary source of truth.",
        "Answer as JSON with formula, explanation, and confidence fields.",
        "Leave formula empty unless the artifact section provides a formula or command.",
        `Artifact file: ${artifact.id === "excel" ? "excel.md" : artifact.id === "sui" ? "sui.md" : `${artifact.id}.artifact.md`}`,
        `Artifact title: ${artifact.title}`,
        `Question pattern: ${artifact.questionPattern}`,
        `Formula pattern: ${artifact.formulaPattern || "none"}`,
        `Concepts: ${artifact.concepts.join(", ") || "none"}`,
        artifactMatch === null
          ? `Artifact content:\n${artifact.answer}`
          : [
              `Retrieval terms: ${artifactMatch.searchTerms.join(", ") || "none"}`,
              `Matched ${artifact.id === "excel" ? "excel.md" : artifact.id === "sui" ? "sui.md" : `${artifact.id}.artifact.md`} section:`,
              `Title: ${artifactMatch.artifactCase.title}`,
              `Question pattern: ${artifactMatch.artifactCase.questionPattern}`,
              `Formula pattern: ${artifactMatch.artifactCase.formulaPattern || "none"}`,
              `Concepts: ${artifactMatch.artifactCase.concepts.join(", ") || "none"}`,
              `Artifact answer: ${artifactMatch.artifactCase.answer}`
            ].join("\n")
      ].join("\n"),
      question,
      fallback
    );
  }

  private answerWithoutArtifact(): ModelAnswer {
    return {
      formula: "",
      explanation: "No matching artifact is in the library yet. Add one from the marketplace or upload a custom artifact.",
      confidence: 0.41,
      provider: this.mockProviderStatus()
    };
  }

  private async callConfiguredModel(
    systemPrompt: string,
    question: string,
    fallback: ModelAnswer
  ): Promise<ModelAnswer> {
    if (this.config.modelMode !== "openai-compatible" || this.config.modelBaseUrl === null) {
      return fallback;
    }

    const provider = this.computeProviderStatus(null, null);

    try {
      const endpoint = `${this.config.modelBaseUrl.replace(/\/+$/, "")}/chat/completions`;
      const response = await this.fetchComputeResponse(endpoint, {
        method: "POST",
        headers: this.modelHeaders(),
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question }
          ],
          temperature: 0,
          response_format: { type: "json_object" },
          ...(this.config.requestTeeVerification ? { verify_tee: true } : {})
        })
      });
      const traceId = response.headers.get("x-request-id");

      if (!response.ok) {
        return {
          ...fallback,
          provider: this.computeProviderStatus(traceId, `External model request failed with status ${response.status}`)
        };
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const payloadTraceId = payload.request_id ?? null;
      const resolvedTraceId = traceId ?? payloadTraceId;
      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = parseModelContent(content);

      if (parsed === null) {
        return {
          ...fallback,
          provider: this.computeProviderStatus(resolvedTraceId, "External model response was not valid agent JSON", payload)
        };
      }

      return {
        formula: parsed.formula,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
        provider: this.computeProviderStatus(resolvedTraceId, null, payload)
      };
    } catch (error) {
      return {
        ...fallback,
        provider: this.computeProviderStatus(null, error instanceof Error ? error.message : "External model request failed")
      };
    }
  }

  private modelHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (this.config.modelApiKey !== null) {
      headers.Authorization = `Bearer ${this.config.modelApiKey}`;
    }

    return headers;
  }

  private async fetchComputeResponse(endpoint: string, init: RequestInit) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.waitForComputeSlot();

      const response = await fetch(endpoint, init);

      if (response.ok || !isRetryableComputeStatus(response.status) || attempt === maxAttempts) {
        return response;
      }

      await sleep(getRetryDelayMs(response, attempt));
    }

    throw new Error("External model request failed after retries");
  }

  private async waitForComputeSlot() {
    const minIntervalMs = 1_000;
    const elapsedMs = Date.now() - this.lastComputeRequestAt;

    if (elapsedMs < minIntervalMs) {
      await sleep(minIntervalMs - elapsedMs);
    }

    this.lastComputeRequestAt = Date.now();
  }

  private mockProviderStatus(): AgentProviderStatus {
    return {
      mode: "mock",
      modelName: "dataloop-demo-mock",
      baseUrl: null,
      traceId: null,
      teeVerificationRequested: false,
      teeVerified: null,
      errorMessage: null
    };
  }

  private computeProviderStatus(
    traceId: string | null,
    errorMessage: string | null,
    payload?: ChatCompletionResponse
  ): AgentProviderStatus {
    return {
      mode: "external-compute",
      modelName: this.config.modelName,
      baseUrl: this.config.modelBaseUrl,
      traceId,
      teeVerificationRequested: this.config.requestTeeVerification,
      teeVerified:
        typeof payload?.tee_verified === "boolean" ? payload.tee_verified : null,
      errorMessage
    };
  }
}

export function createAgentService(config: AgentRuntimeConfig) {
  return new AgentService(config);
}

function parseModelContent(content: string) {
  try {
    const parsed = JSON.parse(content) as ParsedModelContent;

    if (typeof parsed.explanation !== "string") {
      return null;
    }

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;

    return {
      formula: typeof parsed.formula === "string" ? parsed.formula : "",
      explanation: parsed.explanation,
      confidence: Math.max(0, Math.min(confidence, 1))
    };
  } catch {
    return null;
  }
}

function findBestArtifact(question: string, artifacts: AgentArtifactResource[]) {
  const queryTokens = tokenizeAgentText(question);
  let bestArtifact: AgentArtifactResource | null = null;
  let bestScore = 0;

  for (const artifact of artifacts) {
    const candidateText =
      `${artifact.title} ${artifact.questionPattern} ${artifact.formulaPattern} ${artifact.concepts.join(" ")} ${artifact.tags.join(" ")}`;
    const candidateTokens = tokenizeAgentText(
      candidateText
    );
    let score = countAgentTokenOverlap(queryTokens, candidateTokens);

    if (artifact.id === "sui" && /\b(?:sui|move|object|ownership|programmable\s+transaction|ptb|walrus|storage)\b/i.test(question)) {
      score += 3;
    }

    if (score > bestScore) {
      bestArtifact = artifact;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? bestArtifact : null;
}

interface ArtifactCaseMatch {
  artifactCase: KnowledgeArtifactCase;
  score: number;
  searchTerms: string[];
}

const excelSearchPatterns: Array<{ term: string; pattern: RegExp }> = [
  { term: "sumifs", pattern: /\b(?:sumifs|sum\s+if|sum\s+with|sum\s+where|sum\s+sales|total\s+sales|multiple\s+criteria|multi(?:ple)?\s+condition)/i },
  { term: "sum", pattern: /\b(?:sum|total|add|aggregate)\b/i },
  { term: "countifs", pattern: /\b(?:countifs|count\s+if|count\s+where|count\s+with)\b/i },
  { term: "xlookup", pattern: /\b(?:xlookup|lookup|look\s+up|find|return|salary|employee|exact\s+match)\b/i },
  { term: "vlookup", pattern: /\b(?:vlookup|column\s+index|left\s+lookup|right\s+lookup|avoid\s+vlookup)\b/i },
  { term: "filter", pattern: /\b(?:filter|where|amounts?\s+over|greater\s+than|over\s+\d+)\b/i },
  { term: "dynamic array", pattern: /\b(?:dynamic\s+array|spill|spilled|spill\s+range)\b/i },
  { term: "absolute reference", pattern: /(?:\$[a-z]{0,3}\$?\d+|[a-z]{1,3}\$\d+|\babsolute\b|\block\b|\bfixed\b|\bcopy(?:ied)?\b|\bdollar\b)/i },
  { term: "date criteria", pattern: /\b(?:date|after|before|since|between|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|20\d{2})\b/i },
  { term: "text numbers", pattern: /\b(?:text[-\s]?formatted|text\s+numbers?|stored\s+as\s+text|sum\s+is\s+0|sum\s+returns\s+0)\b/i },
  { term: "value", pattern: /\b(?:value|convert\s+to\s+number|number\s+conversion)\b/i },
  { term: "range", pattern: /\b[a-z]{1,3}\d*:[a-z]{1,3}\d*\b/i },
  { term: "criteria operator", pattern: /(?:>=|<=|<>|>|<|=)/ }
];

const suiSearchPatterns: Array<{ term: string; pattern: RegExp }> = [
  { term: "sui", pattern: /\bsui\b/i },
  { term: "stack", pattern: /\b(?:stack|component|components|architecture|layer\s*1)\b/i },
  { term: "objects", pattern: /\b(?:object|objects|ownership|owned|shared|immutable|object\s+id)\b/i },
  { term: "move", pattern: /\b(?:move|package|module|publish|upgrade|entry\s+function)\b/i },
  { term: "storage", pattern: /\b(?:walrus|storage|blob|publisher|aggregator|sdk|download|upload)\b/i },
  { term: "transactions", pattern: /\b(?:transaction|programmable\s+transaction|ptb|move\s+call|gas|atomic)\b/i }
];

function findBestArtifactCase(question: string, artifact: AgentArtifactResource | null): ArtifactCaseMatch | null {
  if (artifact === null) {
    return null;
  }

  if (artifact.id === "excel") {
    return findBestCase(question, excelArtifactCases, extractExcelSearchTerms, 3);
  }

  if (artifact.id === "sui") {
    return findBestCase(question, suiArtifactCases, extractSuiSearchTerms, 2);
  }

  return null;
}

function findBestCase(
  question: string,
  artifactCases: KnowledgeArtifactCase[],
  extractSearchTerms: (value: string) => Set<string>,
  scoreThreshold: number
): ArtifactCaseMatch | null {
  const queryTokens = tokenizeAgentText(question);
  const searchTerms = extractSearchTerms(question);
  let bestMatch: ArtifactCaseMatch | null = null;
  let bestScore = 0;

  for (const artifactCase of artifactCases) {
    const score = scoreArtifactCase(queryTokens, searchTerms, artifactCase, extractSearchTerms);

    if (score > bestScore) {
      bestMatch = {
        artifactCase,
        score,
        searchTerms: [...searchTerms]
      };
      bestScore = score;
    }
  }

  return bestMatch !== null && bestMatch.score >= scoreThreshold ? bestMatch : null;
}

function scoreArtifactCase(
  queryTokens: Set<string>,
  querySearchTerms: Set<string>,
  artifactCase: KnowledgeArtifactCase,
  extractSearchTerms: (value: string) => Set<string>
) {
  const candidateText = [
    artifactCase.title,
    artifactCase.questionPattern,
    artifactCase.formulaPattern,
    artifactCase.concepts.join(" "),
    artifactCase.tags.join(" "),
    artifactCase.answer
  ].join(" ");
  const candidateTokens = tokenizeAgentText(candidateText);
  const candidateSearchTerms = extractSearchTerms(candidateText);
  let score = countAgentTokenOverlap(queryTokens, candidateTokens);

  for (const term of querySearchTerms) {
    if (candidateSearchTerms.has(term)) {
      score += 5;
    }
  }

  const normalizedCandidateText = candidateText.toLowerCase();
  for (const token of queryTokens) {
    if (normalizedCandidateText.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function extractExcelSearchTerms(value: string) {
  const terms = new Set<string>();

  for (const { term, pattern } of excelSearchPatterns) {
    if (pattern.test(value)) {
      terms.add(term);
    }
  }

  const functionMatches = value.match(/\b[A-Z][A-Z0-9.]{2,}\s*\(/gi) ?? [];
  for (const match of functionMatches) {
    terms.add(match.replace(/\s*\($/, "").toLowerCase());
  }

  return terms;
}

function extractSuiSearchTerms(value: string) {
  const terms = new Set<string>();

  for (const { term, pattern } of suiSearchPatterns) {
    if (pattern.test(value)) {
      terms.add(term);
    }
  }

  return terms;
}

function tokenizeAgentText(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(
        (token) =>
          (token.length >= 4 || token === "sui") &&
          !["with", "from", "what", "where", "when", "into"].includes(token)
      )
  );
}

function countAgentTokenOverlap(queryTokens: Set<string>, candidateTokens: Set<string>) {
  let score = 0;

  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function isRetryableComputeStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter === null ? NaN : Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(12_000, retryAfterSeconds * 1_000);
  }

  return Math.min(12_000, 1_500 * 2 ** (attempt - 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
