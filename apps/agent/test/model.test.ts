import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { AgentBenchmarkCase } from "@dataloop/shared";

import { buildKnowledgeArtifact } from "../src/artifacts";
import type { AgentConfig } from "../src/config";
import { buildRetrievedArtifactContext, createAgentModel } from "../src/model";

const fixturePath = path.resolve(__dirname, "..", "fixtures/support-benchmark.json");

test("builds compact artifact prompt context without raw markdown sections", async () => {
  const benchmarkCase = await loadBenchmarkCase("network-wrong-chain");
  const artifact = buildKnowledgeArtifact({
    runId: "run-1",
    benchmarkCase,
    issues: [
      {
        code: "CATEGORY_MISMATCH",
        message: "Synthetic issue"
      }
    ],
    domain: "support",
    generatedAt: "2026-04-23T00:00:00.000Z"
  });

  const context = buildRetrievedArtifactContext([artifact]);

  assert.match(context, /artifactId:/);
  assert.match(context, /resolutionSteps:/);
  assert.doesNotMatch(context, /## /);
});

test("sends compact artifact snippets to the OpenAI-compatible model backend", async () => {
  const benchmarkCase = await loadBenchmarkCase("network-wrong-chain");
  const artifact = buildKnowledgeArtifact({
    runId: "run-1",
    benchmarkCase,
    issues: [
      {
        code: "CATEGORY_MISMATCH",
        message: "Synthetic issue"
      }
    ],
    domain: "support",
    generatedAt: "2026-04-23T00:00:00.000Z"
  });
  const config: AgentConfig = {
    domain: "support",
    benchmarkPath: fixturePath,
    outputDir: path.resolve(__dirname, "..", "runs"),
    artifactLibraryDir: path.resolve(__dirname, "..", "knowledge"),
    artifactManifestPath: path.resolve(__dirname, "..", "knowledge", "manifest.json"),
    minConfidence: 0.72,
    retrievalLimit: 2,
    retrievalMinScore: 1,
    modelMode: "openai-compatible",
    modelName: "qwen-2.5-7b-instruct",
    modelBaseUrl: "https://example.test",
    modelApiKey: "secret",
    pushToPlatform: false,
    registerDatasetVersion: false,
    platformApiUrl: null,
    platformCreatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    platformSubmitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    platformRegistrarAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    platformDatasetId: null
  };
  const model = createAgentModel(config);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: String(init?.body ?? "")
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify((benchmarkCase as any).expected)
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const output = await model.generate({
      systemPrompt: "Return strict JSON only.",
      benchmarkCase,
      retrievedArtifacts: [artifact]
    });
    const firstRequest = requests[0];

    assert.ok(firstRequest);

    const requestPayload = JSON.parse(firstRequest.body) as {
      messages: Array<{ content: string }>;
    };
    const artifactMessage = requestPayload.messages[1];

    assert.ok(artifactMessage);

    assert.equal(output, JSON.stringify((benchmarkCase as any).expected));
    assert.equal(firstRequest.url, "https://example.test/chat/completions");
    assert.match(artifactMessage.content, /artifactId:/);
    assert.doesNotMatch(artifactMessage.content, /## /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function loadBenchmarkCase(benchmarkCaseId: string) {
  const fixtureText = await fs.readFile(fixturePath, "utf8");
  const benchmarkCases = JSON.parse(fixtureText) as AgentBenchmarkCase[];
  const benchmarkCase = benchmarkCases.find((entry) => entry.id === benchmarkCaseId);

  if (benchmarkCase === undefined) {
    throw new Error(`Fixture benchmark case ${benchmarkCaseId} was not found`);
  }

  return benchmarkCase;
}
