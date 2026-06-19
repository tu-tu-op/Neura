import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AgentBenchmarkCase, AgentEvaluationIssue } from "@dataloop/shared";

import {
  buildKnowledgeArtifact,
  loadArtifactLibrary,
  mergeArtifactSets,
  persistArtifactLibrary,
  retrieveArtifacts,
  fetchArtifactFromStorage,
  uploadArtifactToStorage,
  verifyArtifactIntegrity
} from "../src/artifacts";

const fixturePath = path.resolve(__dirname, "..", "fixtures/support-benchmark.json");

test("uploads, fetches, and verifies Walrus artifact bytes", async () => {
  const blobs = new Map<string, Uint8Array>();
  const client = {
    async writeBlob({ blob }: { blob: Uint8Array }) {
      const blobId = "test-blob-id";
      blobs.set(blobId, blob.slice());
      return { blobId };
    },
    async readBlob({ blobId }: { blobId: string }) {
      const blob = blobs.get(blobId);
      if (!blob) {
        throw new Error(`Missing test blob ${blobId}`);
      }
      return blob.slice();
    }
  };
  const data = new TextEncoder().encode("Neura artifact stored on Walrus");
  const upload = await uploadArtifactToStorage(data, { client, signer: {} });

  assert.equal(upload.storageUri, "walrus://test-blob-id");
  assert.equal(upload.storageHash.length, 32);
  assert.deepEqual(await fetchArtifactFromStorage(upload.storageUri, client), data);
  assert.equal(await verifyArtifactIntegrity(upload.storageUri, upload.storageHash, client), true);

  const tamperedHash = upload.storageHash.slice();
  tamperedHash[0] = (tamperedHash[0] ?? 0) ^ 0xff;
  assert.equal(await verifyArtifactIntegrity(upload.storageUri, tamperedHash, client), false);
});

test("keeps the same artifact version when the rendered content is unchanged", async () => {
  const benchmarkCase = await loadBenchmarkCase("insufficient-gas");
  const issues = buildIssues("CATEGORY_MISMATCH");
  const original = buildKnowledgeArtifact({
    runId: "run-1",
    benchmarkCase,
    issues,
    domain: "support",
    generatedAt: "2026-04-23T00:00:00.000Z"
  });
  const repeated = buildKnowledgeArtifact({
    runId: "run-2",
    benchmarkCase,
    issues,
    domain: "support",
    existingArtifact: original,
    generatedAt: "2026-04-24T00:00:00.000Z"
  });

  assert.equal(repeated.version, 1);
  assert.equal(repeated.fileName, original.fileName);
  assert.equal(repeated.markdown, original.markdown);
  assert.equal(repeated.frontmatter.storage.contentHash, original.frontmatter.storage.contentHash);
});

test("increments the artifact version when the artifact content changes", async () => {
  const benchmarkCase = await loadBenchmarkCase("insufficient-gas");
  const issues = buildIssues("CATEGORY_MISMATCH");
  const original = buildKnowledgeArtifact({
    runId: "run-1",
    benchmarkCase,
    issues,
    domain: "support",
    generatedAt: "2026-04-23T00:00:00.000Z"
  });
  const updated = buildKnowledgeArtifact({
    runId: "run-2",
    benchmarkCase: {
      ...benchmarkCase,
      expected: {
        ...(benchmarkCase as any).expected,
        suggestedResolution: `${(benchmarkCase as any).expected.suggestedResolution} Confirm the wallet is using the correct asset.`
      }
    },
    issues,
    domain: "support",
    existingArtifact: original,
    generatedAt: "2026-04-24T00:00:00.000Z"
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.fileName, "insufficient-gas.v2.artifact.md");
  assert.notEqual(updated.frontmatter.storage.contentHash, original.frontmatter.storage.contentHash);
});

test("loads persisted artifacts from the manifest and retrieves only the best lexical matches", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dataloop-artifacts-"));
  const artifactLibraryDir = path.join(tempDir, "knowledge");
  const artifactManifestPath = path.join(artifactLibraryDir, "manifest.json");
  const issues = buildIssues("CATEGORY_MISMATCH");
  const gasCase = await loadBenchmarkCase("insufficient-gas");
  const walletCase = await loadBenchmarkCase("wallet-extension");
  const scamCase = await loadBenchmarkCase("malicious-approval");
  const artifacts = mergeArtifactSets([], [
    buildKnowledgeArtifact({ runId: "run-1", benchmarkCase: gasCase, issues, domain: "support", generatedAt: "2026-04-23T00:00:00.000Z" }),
    buildKnowledgeArtifact({ runId: "run-1", benchmarkCase: walletCase, issues, domain: "support", generatedAt: "2026-04-23T00:00:00.000Z" }),
    buildKnowledgeArtifact({ runId: "run-1", benchmarkCase: scamCase, issues, domain: "support", generatedAt: "2026-04-23T00:00:00.000Z" })
  ]);

  await persistArtifactLibrary({ artifactLibraryDir, artifactManifestPath }, artifacts);

  const loadedLibrary = await loadArtifactLibrary({ artifactLibraryDir, artifactManifestPath });
  const storageManifest = JSON.parse(
    await fs.readFile(path.join(artifactLibraryDir, "storage-manifest.json"), "utf8")
  ) as { storageProvider: string; uploadStatus: string; files: unknown[] };
  const retrieved = retrieveArtifacts(gasCase, loadedLibrary.artifacts, 1, 8);
  const unrelatedRetrieved = retrieveArtifacts(
    {
      ...gasCase,
      id: "unrelated-networking-case",
      title: "DNS cache issue in the browser",
      userPrompt: "The builder website loads slowly because the browser DNS cache looks stale."
    },
    loadedLibrary.artifacts,
    3,
    8
  );

  assert.equal(loadedLibrary.manifest.length, 3);
  assert.equal(loadedLibrary.storageManifest.files.length, 3);
  assert.equal(storageManifest.storageProvider, "WALRUS");
  assert.equal(storageManifest.uploadStatus, "prepared");
  assert.equal(storageManifest.files.length, 3);
  assert.deepEqual(
    retrieved.map((artifact) => artifact.benchmarkCaseId),
    ["insufficient-gas"]
  );
  assert.equal(unrelatedRetrieved.length, 0);
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

function buildIssues(code: AgentEvaluationIssue["code"]): AgentEvaluationIssue[] {
  return [
    {
      code,
      message: `Synthetic issue for ${code}`
    }
  ];
}
