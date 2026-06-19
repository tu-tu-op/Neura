import type { AgentBenchmarkCase, AgentKnowledgeArtifact } from "@dataloop/shared";

import type { AgentConfig } from "./config";
import { buildExpectedExcelResponse, isSupportBenchmarkCase } from "./responses";

export interface AgentModel {
  generate(input: {
    systemPrompt: string;
    benchmarkCase: AgentBenchmarkCase;
    retrievedArtifacts: AgentKnowledgeArtifact[];
  }): Promise<string>;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export function createAgentModel(config: AgentConfig): AgentModel {
  if (config.modelMode === "openai-compatible") {
    return new OpenAiCompatibleAgentModel(config);
  }

  return new MockAgentModel();
}

export function buildRetrievedArtifactContext(retrievedArtifacts: AgentKnowledgeArtifact[]) {
  if (retrievedArtifacts.length === 0) {
    return "No retrieved artifacts were found for this task.";
  }

  return retrievedArtifacts
    .map((artifact, index) => {
      // Excel domain artifacts
      if (artifact.frontmatter.domain === "excel-qna") {
        const concepts = artifact.frontmatter.concepts?.join(", ") || "N/A";
        const formulaPattern = artifact.frontmatter.formulaPattern || "N/A";
        const resolutionSteps = artifact.frontmatter.resolutionSteps.join(" ");

        return [
          `Artifact ${index + 1}`,
          `artifactId: ${artifact.artifactId}`,
          `title: ${artifact.frontmatter.title}`,
          `questionPattern: ${artifact.frontmatter.issuePattern}`,
          `formulaPattern: ${formulaPattern}`,
          `concepts: ${concepts}`,
          `difficulty: ${artifact.frontmatter.difficulty || "N/A"}`,
          `answer: ${resolutionSteps}`
        ].join("\n");
      }

      // Support domain artifacts
      const escalationRule = artifact.frontmatter.requiresHuman ? "Escalate to a human." : "No human escalation required.";
      const resolutionSteps = artifact.frontmatter.resolutionSteps.join(" ");

      return [
        `Artifact ${index + 1}`,
        `artifactId: ${artifact.artifactId}`,
        `title: ${artifact.frontmatter.title}`,
        `issuePattern: ${artifact.frontmatter.issuePattern}`,
        `classification: ${artifact.frontmatter.classification}`,
        `severity: ${artifact.frontmatter.severity}`,
        `escalation: ${escalationRule}`,
        `resolutionSteps: ${resolutionSteps}`
      ].join("\n");
    })
    .join("\n\n");
}

class MockAgentModel implements AgentModel {
  async generate(input: {
    systemPrompt: string;
    benchmarkCase: AgentBenchmarkCase;
    retrievedArtifacts: AgentKnowledgeArtifact[];
  }) {
    void input.systemPrompt;

    const matchedArtifact = input.retrievedArtifacts.find(
      (artifact) => artifact.benchmarkCaseId === input.benchmarkCase.id
    );

    if (matchedArtifact !== undefined) {
      if (isSupportBenchmarkCase(input.benchmarkCase)) {
        return JSON.stringify(input.benchmarkCase.expected);
      }

      return JSON.stringify(buildExpectedExcelResponse(input.benchmarkCase));
    }

    return input.benchmarkCase.mockResponse;
  }
}

class OpenAiCompatibleAgentModel implements AgentModel {
  private lastRequestAt = 0;

  constructor(private readonly config: AgentConfig) {}

  async generate(input: {
    systemPrompt: string;
    benchmarkCase: AgentBenchmarkCase;
    retrievedArtifacts: AgentKnowledgeArtifact[];
  }) {
    const artifactContext = buildRetrievedArtifactContext(input.retrievedArtifacts);

    const requestUrl = `${this.config.modelBaseUrl}/chat/completions`;
    let response: Response;

    try {
      response = await this.fetchWithRetry(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.modelApiKey ? { Authorization: `Bearer ${this.config.modelApiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.config.modelName,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.systemPrompt },
            {
              role: "system",
              content: [
                "Retrieved markdown artifacts follow.",
                "Use them as specialist knowledge before answering.",
                artifactContext
              ].join("\n\n")
            },
            { role: "user", content: input.benchmarkCase.userPrompt }
          ]
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      return buildModelFailureOutput(`Model request to ${requestUrl} failed: ${message}`);
    }

    const payload = (await response.json()) as OpenAiChatCompletionResponse;
    const choice = payload.choices?.[0]?.message?.content;

    if (typeof choice === "string") {
      return choice;
    }

    if (Array.isArray(choice)) {
      return choice
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }

    throw new Error("Model response did not include a usable message");
  }

  private async fetchWithRetry(requestUrl: string, init: RequestInit) {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.waitForRateLimitSlot();

      const response = await fetch(requestUrl, init);

      if (response.ok) {
        return response;
      }

      if (!isRetryableModelStatus(response.status) || attempt === maxAttempts) {
        throw new Error(`Model request failed with status ${response.status}`);
      }

      await sleep(getRetryDelayMs(response, attempt));
    }

    throw new Error("Model request failed after retries");
  }

  private async waitForRateLimitSlot() {
    const minIntervalMs = 1_250;
    const elapsedMs = Date.now() - this.lastRequestAt;

    if (elapsedMs < minIntervalMs) {
      await sleep(minIntervalMs - elapsedMs);
    }

    this.lastRequestAt = Date.now();
  }
}

function buildModelFailureOutput(message: string) {
  return JSON.stringify({
    explanation: message,
    confidence: 0
  });
}

function isRetryableModelStatus(status: number) {
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
