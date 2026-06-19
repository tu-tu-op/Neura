import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AgentConfig } from "../src/config";
import { runAgentBenchmark } from "../src/pipeline";

test("runs the benchmark in mock mode and persists a manifest-backed artifact library", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dataloop-agent-"));
  const outputDir = path.join(tempDir, "runs");
  const artifactLibraryDir = path.join(tempDir, "knowledge");
  const artifactManifestPath = path.join(artifactLibraryDir, "manifest.json");

  const config: AgentConfig = {
    domain: "support",
    benchmarkPath: path.resolve(__dirname, "..", "fixtures/support-benchmark.json"),
    outputDir,
    artifactLibraryDir,
    artifactManifestPath,
    minConfidence: 0.72,
    retrievalLimit: 2,
    retrievalMinScore: 1,
    modelMode: "mock",
    modelName: "mock-model",
    modelBaseUrl: null,
    modelApiKey: null,
    pushToPlatform: false,
    registerDatasetVersion: false,
    platformApiUrl: null,
    platformCreatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    platformSubmitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    platformRegistrarAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    platformDatasetId: null
  };

  const originalCwd = process.cwd();
  process.chdir(path.resolve(__dirname, ".."));

  try {
    const result = await runAgentBenchmark(config);

    assert.equal(result.summary.benchmarkCaseCount, 6);
    assert.equal(result.summary.baselinePassedCount, 2);
    assert.equal(result.summary.baselineFailedCount, 4);
    assert.equal(result.summary.artifactPassedCount, 6);
    assert.equal(result.summary.artifactFailedCount, 0);
    assert.equal(result.summary.improvedCount, 4);
    assert.equal(result.summary.artifactCount, 4);

    const report = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "run-report.json"), "utf8")
    ) as { artifactLibraryManifest: unknown[] };
    const training = await fs.readFile(path.join(result.outputPath, "training.jsonl"), "utf8");
    const artifact = await fs.readFile(
      path.join(result.outputPath, "artifacts", "insufficient-gas.v1.artifact.md"),
      "utf8"
    );
    const libraryManifest = JSON.parse(await fs.readFile(artifactManifestPath, "utf8")) as unknown[];
    const storageManifest = JSON.parse(
      await fs.readFile(path.join(artifactLibraryDir, "storage-manifest.json"), "utf8")
    ) as { storageProvider: string; uploadStatus: string; files: unknown[] };
    const manifestSnapshot = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "artifact-manifest.snapshot.json"), "utf8")
    ) as unknown[];
    const storageManifestSnapshot = JSON.parse(
      await fs.readFile(path.join(result.outputPath, "artifact-storage-manifest.snapshot.json"), "utf8")
    ) as { files: unknown[] };
    const comparisonReport = await fs.readFile(
      path.join(result.outputPath, "benchmark-comparison.md"),
      "utf8"
    );

    assert.equal(training.trim().split("\n").length, 4);
    assert.equal(libraryManifest.length, 4);
    assert.equal(storageManifest.storageProvider, "WALRUS");
    assert.equal(storageManifest.uploadStatus, "prepared");
    assert.equal(storageManifest.files.length, 4);
    assert.equal(manifestSnapshot.length, 4);
    assert.equal(storageManifestSnapshot.files.length, 4);
    assert.equal(report.artifactLibraryManifest.length, 4);
    assert.match(comparisonReport, /## Artifact Storage Bundle/);
    assert.match(comparisonReport, /Baseline output:/);
    assert.match(comparisonReport, /Artifact-augmented output:/);
    assert.match(artifact, /## Recommended Resolution Steps/);
    assert.match(artifact, /## Version Metadata/);
    assert.match(artifact, /"schemaVersion": 1/);
    assert.match(artifact, /## Provenance/);
  } finally {
    process.chdir(originalCwd);
  }
});

test("runs the Excel benchmark and shows artifact-augmented improvement", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dataloop-agent-excel-"));
  const outputDir = path.join(tempDir, "runs");
  const artifactLibraryDir = path.join(tempDir, "knowledge");
  const artifactManifestPath = path.join(artifactLibraryDir, "manifest.json");

  const config: AgentConfig = {
    domain: "excel",
    benchmarkPath: path.resolve(__dirname, "..", "fixtures/excel-qna-benchmark.json"),
    outputDir,
    artifactLibraryDir,
    artifactManifestPath,
    minConfidence: 0.72,
    retrievalLimit: 2,
    retrievalMinScore: 1,
    modelMode: "mock",
    modelName: "mock-model",
    modelBaseUrl: null,
    modelApiKey: null,
    pushToPlatform: false,
    registerDatasetVersion: false,
    platformApiUrl: null,
    platformCreatorAddress: "0x1234567890abcdef1234567890abcdef12345678",
    platformSubmitterAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    platformRegistrarAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    platformDatasetId: null
  };

  const result = await runAgentBenchmark(config);
  const report = JSON.parse(
    await fs.readFile(path.join(result.outputPath, "run-report.json"), "utf8")
  ) as {
    baselinePassedCount: number;
    artifactPassedCount: number;
    improvedCount: number;
    artifactCount: number;
    artifactLibraryManifest: unknown[];
  };
  const comparisonReport = await fs.readFile(
    path.join(result.outputPath, "benchmark-comparison.md"),
    "utf8"
  );
  const training = await fs.readFile(path.join(result.outputPath, "training.jsonl"), "utf8");

  assert.equal(result.summary.benchmarkCaseCount, 20);
  assert.equal(result.summary.baselinePassedCount, 5);
  assert.equal(result.summary.baselineFailedCount, 15);
  assert.equal(result.summary.artifactPassedCount, 20);
  assert.equal(result.summary.artifactFailedCount, 0);
  assert.equal(result.summary.improvedCount, 15);
  assert.equal(result.summary.artifactCount, 15);
  assert.equal(report.baselinePassedCount, 5);
  assert.equal(report.artifactPassedCount, 20);
  assert.equal(report.improvedCount, 15);
  assert.equal(report.artifactCount, 15);
  assert.equal(report.artifactLibraryManifest.length, 15);
  assert.equal(training.trim().split("\n").length, 15);
  assert.match(comparisonReport, /Artifact-augmented passed: 20/);
  assert.match(comparisonReport, /Improved cases: 15/);
});
