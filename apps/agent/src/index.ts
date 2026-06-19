import path from "node:path";

import dotenv from "dotenv";

import { findWorkspaceRoot, getAgentConfig } from "./config";
import { runAgentBenchmark } from "./pipeline";

loadEnvFiles();

async function main() {
  const command = process.argv[2] ?? "run";

  if (command !== "run") {
    throw new Error(`Unsupported command: ${command}`);
  }

  const result = await runAgentBenchmark(getAgentConfig());

  console.log(`Week 2 agent run complete: ${result.runId}`);
  console.log(`Benchmark cases: ${result.summary.benchmarkCaseCount}`);
  console.log(`Baseline passed: ${result.summary.baselinePassedCount}`);
  console.log(`Baseline failed: ${result.summary.baselineFailedCount}`);
  console.log(`Artifact-augmented passed: ${result.summary.artifactPassedCount}`);
  console.log(`Artifact-augmented failed: ${result.summary.artifactFailedCount}`);
  console.log(`Improved cases: ${result.summary.improvedCount}`);
  console.log(`Artifacts generated: ${result.summary.artifactCount}`);
  console.log(`Output directory: ${result.outputPath}`);
  console.log(`Published tasks: ${result.summary.publishedTaskCount}`);
  console.log(`Published corrections: ${result.summary.publishedCorrectionCount}`);
  console.log(`Dataset registered: ${String(result.summary.registeredDatasetVersion)}`);

  if (result.publishResult.errors.length > 0) {
    console.log("Platform publishing notes:");
    for (const message of result.publishResult.errors) {
      console.log(`- ${message}`);
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(message);
  process.exitCode = 1;
});

function loadEnvFiles() {
  const cwdEnvPath = path.resolve(process.cwd(), ".env");
  const workspaceEnvPath = path.join(findWorkspaceRoot(process.cwd()), ".env");

  dotenv.config({ path: cwdEnvPath });

  if (workspaceEnvPath !== cwdEnvPath) {
    dotenv.config({ path: workspaceEnvPath });
  }
}
