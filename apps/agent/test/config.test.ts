import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { findWorkspaceRoot, getAgentConfig } from "../src/config";

test("resolves default agent paths from the workspace root", () => {
  const workspaceRoot = path.resolve(__dirname, "../../..");
  const originalCwd = process.cwd();

  process.chdir(path.join(workspaceRoot, "apps/agent"));

  try {
    const config = getAgentConfig({} as NodeJS.ProcessEnv);

    assert.equal(findWorkspaceRoot(), workspaceRoot);
    assert.equal(config.benchmarkPath, path.join(workspaceRoot, "apps/agent/fixtures/support-benchmark.json"));
    assert.equal(config.outputDir, path.join(workspaceRoot, "apps/agent/runs"));
    assert.equal(config.artifactLibraryDir, path.join(workspaceRoot, "apps/agent/knowledge"));
    assert.equal(config.artifactManifestPath, path.join(workspaceRoot, "apps/agent/knowledge/manifest.json"));
  } finally {
    process.chdir(originalCwd);
  }
});

test("places the default artifact manifest inside an overridden library directory", () => {
  const artifactLibraryDir = "/tmp/dataloop-agent-knowledge";
  const config = getAgentConfig({
    AGENT_ARTIFACT_LIBRARY_DIR: artifactLibraryDir
  } as NodeJS.ProcessEnv);

  assert.equal(config.artifactLibraryDir, artifactLibraryDir);
  assert.equal(config.artifactManifestPath, path.join(artifactLibraryDir, "manifest.json"));
});
