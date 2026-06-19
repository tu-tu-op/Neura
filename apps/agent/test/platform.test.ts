import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { AgentBenchmarkCase, AgentCorrectionRecord, AgentFailureRecord } from "@dataloop/shared";

import { buildArtifactManifestEntry, buildKnowledgeArtifact } from "../src/artifacts";
import type { AgentConfig } from "../src/config";
import { sha256Hex } from "../src/hash";
import { publishFailuresToPlatform } from "../src/platform";

const fixturePath = path.resolve(__dirname, "..", "fixtures/support-benchmark.json");

test("publishes failure and correction metadata with artifact manifest details", async () => {
  const benchmarkCase = await loadBenchmarkCase("insufficient-gas");
  const knowledgeArtifact = buildKnowledgeArtifact({
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
  const failure: AgentFailureRecord = {
    runId: "run-1",
    benchmarkCase,
    rawModelOutput: benchmarkCase.mockResponse,
    parsedModelOutput: null,
    evaluation: {
      passed: false,
      issues: [
        {
          code: "INVALID_JSON",
          message: "Synthetic invalid JSON failure"
        }
      ]
    }
  };
  const correction: AgentCorrectionRecord = {
    runId: "run-1",
    benchmarkCaseId: benchmarkCase.id,
    correctedResponse: (benchmarkCase as any).expected,
    knowledgeArtifact,
    trainingExample: {
      messages: [],
      metadata: {
        benchmarkCaseId: benchmarkCase.id,
        benchmarkTitle: benchmarkCase.title,
        failureCodes: ["INVALID_JSON"]
      }
    },
    sourceFailureCodes: ["INVALID_JSON"]
  };
  const config: AgentConfig = {
    domain: "support",
    benchmarkPath: fixturePath,
    outputDir: path.resolve(__dirname, "..", "runs"),
    artifactLibraryDir: path.resolve(__dirname, "..", "knowledge"),
    artifactManifestPath: path.resolve(__dirname, "..", "knowledge", "manifest.json"),
    minConfidence: 0.72,
    retrievalLimit: 2,
    retrievalMinScore: 1,
    modelMode: "mock",
    modelName: "mock-model",
    modelBaseUrl: null,
    modelApiKey: null,
    pushToPlatform: true,
    registerDatasetVersion: true,
    platformApiUrl: "https://platform.example.test",
    platformCreatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    platformSubmitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    platformRegistrarAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    platformDatasetId: "0x1111111111111111111111111111111111111111111111111111111111111111"
  };
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: String(init?.body ?? "")
    });

    if (requests.length === 1) {
      return jsonResponse({
        task: {
          taskId: "0x2222222222222222222222222222222222222222222222222222222222222222"
        }
      });
    }

    if (requests.length === 2) {
      return jsonResponse({
        correction: {
          correctionId: "1"
        }
      });
    }

    return jsonResponse({
      version: {
        versionNumber: 1
      }
    });
  }) as typeof fetch;

  try {
    const result = await publishFailuresToPlatform(
      config,
      "run-1",
      "support-benchmark",
      [failure],
      [correction],
      {
        artifactManifest: [buildArtifactManifestEntry(knowledgeArtifact)]
      }
    );
    const relatedArtifacts = [buildArtifactManifestEntry(knowledgeArtifact)];
    const taskRequest = requests[0];
    const correctionRequest = requests[1];
    const datasetRequest = requests[2];

    assert.ok(taskRequest);
    assert.ok(correctionRequest);
    assert.ok(datasetRequest);

    const taskPayload = JSON.parse(taskRequest.body) as { metadataUri: string; metadataHash: string };
    const correctionPayload = JSON.parse(correctionRequest.body) as { metadataHash: string };
    const datasetPayload = JSON.parse(datasetRequest.body) as {
      entries: unknown[];
      metadataHash: string;
      immutableRef: string;
    };

    assert.equal(result.publishedTaskCount, 1);
    assert.equal(result.publishedCorrectionCount, 1);
    assert.equal(result.registeredDatasetVersion, true);
    assert.equal(requests.length, 3);
    assert.equal(taskPayload.metadataUri, "artifact://agent-runs/run-1/insufficient-gas.failure.json");
    assert.equal(
      taskPayload.metadataHash,
      sha256Hex(JSON.stringify({ failure, relatedArtifacts }, null, 2))
    );
    assert.equal(
      correctionPayload.metadataHash,
      sha256Hex(JSON.stringify({ correction, relatedArtifacts }, null, 2))
    );
    assert.equal(datasetPayload.entries.length, 2);
    assert.equal(datasetPayload.immutableRef, "agent-run:run-1");
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

function jsonResponse(data: unknown) {
  return new Response(
    JSON.stringify({
      data
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
