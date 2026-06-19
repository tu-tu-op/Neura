import fs from "node:fs";
import path from "node:path";

export type AgentModelMode = "mock" | "openai-compatible";
export type AgentDomain = "support" | "excel";

export interface AgentConfig {
  domain: AgentDomain;
  benchmarkPath: string;
  outputDir: string;
  artifactLibraryDir: string;
  artifactManifestPath: string;
  minConfidence: number;
  retrievalLimit: number;
  retrievalMinScore: number;
  modelMode: AgentModelMode;
  modelName: string;
  modelBaseUrl: string | null;
  modelApiKey: string | null;
  pushToPlatform: boolean;
  registerDatasetVersion: boolean;
  platformApiUrl: string | null;
  platformCreatorAddress: string;
  platformSubmitterAddress: string;
  platformRegistrarAddress: string;
  platformDatasetId: string | null;
}

export function getAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const modelMode = parseModelMode(env.AGENT_MODEL_MODE);
  const domain = parseDomain(env.AGENT_DOMAIN);
  const benchmarkPath = resolveWorkspacePath(
    workspaceRoot,
    env.AGENT_BENCHMARK_PATH,
    domain === "excel"
      ? "apps/agent/fixtures/excel-qna-benchmark.json"
      : "apps/agent/fixtures/support-benchmark.json"
  );
  const outputDir = resolveWorkspacePath(workspaceRoot, env.AGENT_OUTPUT_DIR, "apps/agent/runs");
  const artifactLibraryDir = resolveWorkspacePath(
    workspaceRoot,
    env.AGENT_ARTIFACT_LIBRARY_DIR,
    "apps/agent/knowledge"
  );
  const artifactManifestPath = env.AGENT_ARTIFACT_MANIFEST_PATH
    ? resolveWorkspacePath(workspaceRoot, env.AGENT_ARTIFACT_MANIFEST_PATH, "")
    : path.join(artifactLibraryDir, "manifest.json");
  const pushToPlatform = parseBoolean(env.AGENT_PUSH_TO_PLATFORM ?? "false");
  const registerDatasetVersion = parseBoolean(env.AGENT_REGISTER_DATASET_VERSION ?? "false");

  return {
    domain,
    benchmarkPath,
    outputDir,
    artifactLibraryDir,
    artifactManifestPath,
    minConfidence: parseConfidence(env.AGENT_MIN_CONFIDENCE),
    retrievalLimit: parseRetrievalLimit(env.AGENT_RETRIEVAL_LIMIT),
    retrievalMinScore: parseRetrievalMinScore(env.AGENT_RETRIEVAL_MIN_SCORE),
    modelMode,
    modelName: requireNonEmpty(env.AGENT_MODEL_NAME ?? "qwen/qwen-2.5-7b-instruct", "AGENT_MODEL_NAME"),
    modelBaseUrl:
      modelMode === "openai-compatible"
        ? requireNonEmpty(env.AGENT_MODEL_BASE_URL, "AGENT_MODEL_BASE_URL")
        : optionalNonEmpty(env.AGENT_MODEL_BASE_URL),
    modelApiKey: optionalNonEmpty(env.AGENT_MODEL_API_KEY),
    pushToPlatform,
    registerDatasetVersion,
    platformApiUrl: pushToPlatform || registerDatasetVersion
      ? requireNonEmpty(env.AGENT_PLATFORM_API_URL, "AGENT_PLATFORM_API_URL")
      : optionalNonEmpty(env.AGENT_PLATFORM_API_URL),
    platformCreatorAddress: requireNonEmpty(
      env.AGENT_PLATFORM_CREATOR_ADDRESS ?? "0x1234567890abcdef1234567890abcdef12345678",
      "AGENT_PLATFORM_CREATOR_ADDRESS"
    ),
    platformSubmitterAddress: requireNonEmpty(
      env.AGENT_PLATFORM_SUBMITTER_ADDRESS ?? "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "AGENT_PLATFORM_SUBMITTER_ADDRESS"
    ),
    platformRegistrarAddress: requireNonEmpty(
      env.AGENT_PLATFORM_REGISTRAR_ADDRESS ?? "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "AGENT_PLATFORM_REGISTRAR_ADDRESS"
    ),
    platformDatasetId: optionalNonEmpty(env.AGENT_PLATFORM_DATASET_ID)
  };
}

export function findWorkspaceRoot(startDir: string = process.cwd()) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packagePath = path.join(currentDir, "package.json");

    if (fs.existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { workspaces?: unknown };

        if (Array.isArray(packageJson.workspaces)) {
          return currentDir;
        }
      } catch {
        // Keep walking upward; a malformed package.json should surface in normal package tooling.
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }

    currentDir = parentDir;
  }
}

function resolveWorkspacePath(workspaceRoot: string, value: string | undefined, fallback: string) {
  const candidate = value ?? fallback;

  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  return path.resolve(workspaceRoot, candidate);
}

function parseModelMode(value: string | undefined): AgentModelMode {
  return value === "openai-compatible" ? "openai-compatible" : "mock";
}

function parseDomain(value: string | undefined): AgentDomain {
  return value === "excel" ? "excel" : "support";
}

function parseConfidence(value: string | undefined) {
  const parsed = Number(value ?? "0.72");

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("AGENT_MIN_CONFIDENCE must be a number between 0 and 1");
  }

  return parsed;
}

function parseRetrievalLimit(value: string | undefined) {
  const parsed = Number(value ?? "2");

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("AGENT_RETRIEVAL_LIMIT must be a positive integer");
  }

  return parsed;
}

function parseRetrievalMinScore(value: string | undefined) {
  const parsed = Number(value ?? "1");

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("AGENT_RETRIEVAL_MIN_SCORE must be a non-negative number");
  }

  return parsed;
}

function parseBoolean(value: string) {
  return value === "1" || value.toLowerCase() === "true";
}

function requireNonEmpty(value: string | undefined, name: string) {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function optionalNonEmpty(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}
