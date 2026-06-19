import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentArtifactFrontmatter,
  AgentArtifactManifest,
  AgentArtifactStorageManifest,
  AgentBenchmarkCase,
  AgentEvaluationIssue,
  AgentKnowledgeArtifact
} from "@dataloop/shared";

import type { AgentConfig } from "./config";
import { sha256Hex } from "./hash";
import { computeContentHash, contentHashToHex } from "./lib/content-hash";
import { getAgentSigner, getSuiClient, getWalrusClient } from "./lib/walrus-client";
import {
  artifactDomainForAgentDomain,
  expectedArtifactDomainForBenchmarkCase,
  isExcelBenchmarkCase,
  isSupportBenchmarkCase
} from "./responses";

const ARTIFACT_SCHEMA_VERSION = 1;
const STORAGE_MANIFEST_SCHEMA_VERSION = 1;
const ARTIFACT_URI_PREFIX = "artifact://agent-knowledge";
const ARTIFACT_DIRECTORY_NAME = "artifacts";
const STORAGE_MANIFEST_FILE_NAME = "storage-manifest.json";
const RETRIEVAL_STOPWORDS = new Set([
  "about",
  "after",
  "already",
  "before",
  "builder",
  "cannot",
  "chain",
  "connected",
  "correction",
  "dapp",
  "does",
  "expected",
  "from",
  "gets",
  "have",
  "into",
  "issue",
  "needs",
  "says",
  "submission",
  "submit",
  "task",
  "that",
  "their",
  "them",
  "they",
  "this",
  "transaction",
  "user",
  "wallet",
  "with"
]);

export interface ArtifactLibrary {
  artifacts: AgentKnowledgeArtifact[];
  manifest: AgentArtifactManifest[];
  storageManifest: AgentArtifactStorageManifest;
}

export interface StorageUploadResult {
  storageUri: string;
  storageHash: Uint8Array;
}

interface WalrusStorageClient {
  writeBlob(options: {
    blob: Uint8Array;
    deletable: boolean;
    epochs: number;
    signer: unknown;
    onStep?: (step: { step: string; txDigest?: string }) => void;
  }): Promise<{ blobId: string }>;
  readBlob(options: { blobId: string }): Promise<Uint8Array>;
}

interface WalrusStorageDependencies {
  client?: WalrusStorageClient;
  signer?: unknown;
}

export async function uploadArtifactToStorage(
  data: Uint8Array,
  dependencies: WalrusStorageDependencies = {}
): Promise<StorageUploadResult> {
  const storageHash = computeContentHash(data);
  const signer = dependencies.signer ?? await getAgentSigner();
  const client = dependencies.client ?? await resolveWalrusStorageClient();
  const epochs = parseWalrusEpochs(process.env.WALRUS_DEFAULT_EPOCHS);
  const { blobId } = await client.writeBlob({
    blob: data,
    deletable: true,
    epochs,
    signer
  });

  return {
    storageUri: `walrus://${blobId}`,
    storageHash
  };
}

export async function fetchArtifactFromStorage(
  storageUri: string,
  client?: WalrusStorageClient
): Promise<Uint8Array> {
  const resolvedClient = client ?? await resolveWalrusStorageClient();
  return resolvedClient.readBlob({ blobId: parseWalrusBlobId(storageUri) });
}

export async function verifyArtifactIntegrity(
  storageUri: string,
  expectedHash: Uint8Array,
  client?: WalrusStorageClient
): Promise<boolean> {
  const data = await fetchArtifactFromStorage(storageUri, client);
  const actualHash = computeContentHash(data);

  return actualHash.length === expectedHash.length && Buffer.from(actualHash).equals(Buffer.from(expectedHash));
}

/**
 * Testnet-only HTTP fallback for runtimes where the SDK's WASM bindings cannot
 * be loaded. Mainnet uploads require a private authenticated publisher or SDK.
 */
export async function uploadViaPublisherHttp(data: Uint8Array): Promise<StorageUploadResult> {
  const publisherUrl = process.env.WALRUS_PUBLISHER_URL?.trim();

  if (!publisherUrl) {
    throw new Error("WALRUS_PUBLISHER_URL is not set - HTTP publisher fallback unavailable.");
  }

  if (process.env.WALRUS_NETWORK === "mainnet") {
    throw new Error("The unauthenticated HTTP publisher fallback is testnet-only.");
  }

  const storageHash = computeContentHash(data);
  const epochs = parseWalrusEpochs(process.env.WALRUS_DEFAULT_EPOCHS);
  const response = await fetch(`${trimTrailingSlash(publisherUrl)}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: Buffer.from(data)
  });

  if (!response.ok) {
    throw new Error(`Walrus publisher upload failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };
  const blobId = payload.newlyCreated?.blobObject?.blobId ?? payload.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Unexpected Walrus publisher response: ${JSON.stringify(payload)}`);
  }

  return { storageUri: `walrus://${blobId}`, storageHash };
}

export async function fetchViaAggregatorHttp(storageUri: string): Promise<Uint8Array> {
  const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL?.trim();

  if (!aggregatorUrl) {
    throw new Error("WALRUS_AGGREGATOR_URL is not set - HTTP aggregator fallback unavailable.");
  }

  const blobId = parseWalrusBlobId(storageUri);
  const response = await fetch(`${trimTrailingSlash(aggregatorUrl)}/v1/blobs/${encodeURIComponent(blobId)}`);

  if (!response.ok) {
    throw new Error(`Walrus aggregator fetch failed: ${response.status} ${await response.text()}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function registerArtifactOnChain(
  metadataUri: string,
  metadataHash: Uint8Array,
  storageUri: string,
  storageHash: Uint8Array
) {
  const packageId = process.env.SUI_PACKAGE_ID?.trim();
  const artifactRegistryId = process.env.ARTIFACT_REGISTRY_ID?.trim();

  if (!packageId || !artifactRegistryId) {
    throw new Error("SUI_PACKAGE_ID and ARTIFACT_REGISTRY_ID are required for on-chain registration.");
  }

  const [{ Transaction }, suiClient, signer] = await Promise.all([
    import("@mysten/sui/transactions"),
    getSuiClient(),
    getAgentSigner()
  ]);
  const transaction = new Transaction();
  transaction.moveCall({
    target: `${packageId}::artifact_registry::create_artifact`,
    arguments: [
      transaction.pure.string(metadataUri),
      transaction.pure.vector("u8", Array.from(metadataHash)),
      transaction.pure.string(storageUri),
      transaction.pure.vector("u8", Array.from(storageHash)),
      transaction.object(artifactRegistryId)
    ]
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction,
    signer,
    include: { effects: true, objectChanges: true }
  });

  if (result.$kind === "FailedTransaction") {
    throw new Error(`Sui artifact registration failed: ${result.FailedTransaction.status.error?.message ?? "unknown error"}`);
  }

  return result.Transaction;
}

async function resolveWalrusStorageClient(): Promise<WalrusStorageClient> {
  return await getWalrusClient() as unknown as WalrusStorageClient;
}

function parseWalrusBlobId(storageUri: string) {
  if (!storageUri.startsWith("walrus://")) {
    throw new Error(`Unsupported storage URI: ${storageUri}`);
  }

  const blobId = storageUri.slice("walrus://".length).trim();

  if (!blobId) {
    throw new Error("Walrus storage URI is missing a blob ID.");
  }

  return blobId;
}

function parseWalrusEpochs(value: string | undefined) {
  const epochs = Number(value ?? "3");

  if (!Number.isInteger(epochs) || epochs <= 0) {
    throw new Error("WALRUS_DEFAULT_EPOCHS must be a positive integer.");
  }

  return epochs;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export async function loadArtifactLibrary(
  config: Pick<AgentConfig, "artifactLibraryDir" | "artifactManifestPath">
): Promise<ArtifactLibrary> {
  const manifest = await loadArtifactManifest(config.artifactManifestPath);
  const artifactsDir = getArtifactLibraryArtifactsDir(config.artifactLibraryDir);
  const artifacts: AgentKnowledgeArtifact[] = [];

  for (const entry of manifest) {
    const markdown = await fs.readFile(path.join(artifactsDir, entry.fileName), "utf8");
    const frontmatter = parseArtifactFrontmatter(markdown);

    artifacts.push({
      artifactId: frontmatter.artifactId,
      benchmarkCaseId: frontmatter.benchmarkCaseId,
      version: frontmatter.version,
      fileName: entry.fileName,
      frontmatter,
      markdown,
      retrievalText: entry.retrievalText,
      sourceFailureCodes: frontmatter.provenance.failureCodes
    });
  }

  return {
    artifacts,
    manifest,
    storageManifest: buildArtifactStorageManifest(config, artifacts)
  };
}

export function buildKnowledgeArtifact(input: {
  runId: string;
  benchmarkCase: AgentBenchmarkCase;
  issues: AgentEvaluationIssue[];
  domain: "support" | "excel";
  existingArtifact?: AgentKnowledgeArtifact;
  generatedAt?: string;
}): AgentKnowledgeArtifact {
  const artifactId = sha256Hex(`artifact:${input.benchmarkCase.id}`);
  const domain = artifactDomainForAgentDomain(input.domain);
  const sourceFailureCodes = input.issues.map((issue) => issue.code);
  const excelCase = input.domain === "excel" && isExcelBenchmarkCase(input.benchmarkCase)
    ? input.benchmarkCase
    : null;
  const supportCase = input.domain === "support" && isSupportBenchmarkCase(input.benchmarkCase)
    ? input.benchmarkCase
    : null;

  if (input.domain === "excel" && excelCase === null) {
    throw new Error(`Benchmark case ${input.benchmarkCase.id} is not an Excel benchmark case`);
  }

  if (input.domain === "support" && supportCase === null) {
    throw new Error(`Benchmark case ${input.benchmarkCase.id} is not a support benchmark case`);
  }

  const resolutionSteps = input.domain === "excel"
    ? [excelCase!.expectedAnswer]
    : buildResolutionSteps(supportCase!.expected.suggestedResolution);

  const exampleInputs = [input.benchmarkCase.userPrompt];
  const tags = buildArtifactTags(input.benchmarkCase, input.domain);
  const contentHash = buildArtifactContentHash({
    benchmarkCase: input.benchmarkCase,
    issues: input.issues,
    domain: input.domain
  });

  if (
    input.existingArtifact !== undefined &&
    input.existingArtifact.frontmatter.storage.contentHash === contentHash
  ) {
    return input.existingArtifact;
  }

  const version = input.existingArtifact?.version ? input.existingArtifact.version + 1 : 1;
  const fileName = buildArtifactFileName(input.benchmarkCase.id, version);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const artifactUri = `${ARTIFACT_URI_PREFIX}/${fileName}`;

  const frontmatter: AgentArtifactFrontmatter = input.domain === "excel"
    ? {
        artifactId,
        benchmarkCaseId: input.benchmarkCase.id,
        title: input.benchmarkCase.title,
        domain,
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        issuePattern: input.benchmarkCase.userPrompt,
        ...(excelCase!.expectedFormula !== undefined && excelCase!.expectedFormula.trim().length > 0
          ? { formulaPattern: excelCase!.expectedFormula }
          : {}),
        concepts: excelCase!.requiredConcepts || [],
        difficulty: excelCase!.difficulty,
        version,
        tags,
        resolutionSteps,
        exampleInputs,
        provenance: {
          sourceRunId: input.runId,
          benchmarkCaseId: input.benchmarkCase.id,
          failureCodes: sourceFailureCodes,
          generatedAt
        },
        storage: {
          contentHash,
          artifactUri
        }
      }
    : {
        artifactId,
        benchmarkCaseId: input.benchmarkCase.id,
        title: input.benchmarkCase.title,
        domain,
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        issuePattern: input.benchmarkCase.userPrompt,
        category: supportCase!.expected.category,
        classification: supportCase!.expected.category,
        severity: supportCase!.expected.severity,
        requiresHuman: supportCase!.expected.requiresHuman,
        version,
        tags,
        resolutionSteps,
        exampleInputs,
        provenance: {
          sourceRunId: input.runId,
          benchmarkCaseId: input.benchmarkCase.id,
          failureCodes: sourceFailureCodes,
          generatedAt
        },
        storage: {
          contentHash,
          artifactUri
        }
      };

  const summary = input.domain === "excel"
    ? excelCase!.expectedAnswer
    : supportCase!.expected.summary;

  return {
    artifactId,
    benchmarkCaseId: input.benchmarkCase.id,
    version,
    fileName,
    frontmatter,
    markdown: renderArtifactMarkdown(frontmatter, summary, input.domain),
    retrievalText: buildRetrievalText(frontmatter),
    sourceFailureCodes
  };
}

export function mergeArtifactSets(
  existingArtifacts: AgentKnowledgeArtifact[],
  generatedArtifacts: AgentKnowledgeArtifact[]
) {
  const merged = new Map(existingArtifacts.map((artifact) => [artifact.artifactId, artifact]));

  for (const artifact of generatedArtifacts) {
    merged.set(artifact.artifactId, artifact);
  }

  return [...merged.values()].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

export async function persistArtifactLibrary(
  config: Pick<AgentConfig, "artifactLibraryDir" | "artifactManifestPath">,
  artifacts: AgentKnowledgeArtifact[],
  context: {
    runId?: string;
    suiteLabel?: string;
    generatedAt?: string;
  } = {}
): Promise<ArtifactLibrary> {
  const artifactsDir = getArtifactLibraryArtifactsDir(config.artifactLibraryDir);
  const manifest = artifacts.map(buildArtifactManifestEntry);
  const storageManifest = buildArtifactStorageManifest(config, artifacts, context);

  await fs.mkdir(config.artifactLibraryDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(path.dirname(config.artifactManifestPath), { recursive: true });

  for (const artifact of artifacts) {
    await fs.writeFile(path.join(artifactsDir, artifact.fileName), artifact.markdown, "utf8");
  }

  await fs.writeFile(config.artifactManifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await fs.writeFile(
    getArtifactStorageManifestPath(config.artifactLibraryDir),
    JSON.stringify(storageManifest, null, 2),
    "utf8"
  );

  return {
    artifacts,
    manifest,
    storageManifest
  };
}

export async function uploadArtifactLibraryToStorage(
  config: Pick<AgentConfig, "artifactLibraryDir" | "artifactManifestPath">,
  library: ArtifactLibrary
): Promise<ArtifactLibrary> {
  const uploadedFiles = [];

  for (const artifact of library.artifacts) {
    const bytes = new TextEncoder().encode(artifact.markdown);
    const upload = await uploadArtifactToStorage(bytes);
    let registrationTransactionDigest: string | null = null;

    if (process.env.SUI_PACKAGE_ID?.trim() && process.env.ARTIFACT_REGISTRY_ID?.trim()) {
      const metadataBytes = new TextEncoder().encode(JSON.stringify(artifact.frontmatter));
      const registration = await registerArtifactOnChain(
        artifact.frontmatter.storage.artifactUri ?? `artifact://${artifact.artifactId}`,
        computeContentHash(metadataBytes),
        upload.storageUri,
        upload.storageHash
      );
      registrationTransactionDigest = registration.digest;
    }

    const manifestFile = library.storageManifest.files.find(
      (file) => file.artifactId === artifact.artifactId
    );

    if (!manifestFile) {
      throw new Error(`Storage manifest entry missing for artifact ${artifact.artifactId}`);
    }

    uploadedFiles.push({
      ...manifestFile,
      storageUri: upload.storageUri,
      storageHash: `0x${contentHashToHex(upload.storageHash)}`,
      blobId: parseWalrusBlobId(upload.storageUri),
      registrationTransactionDigest
    });
  }

  const storageManifest: AgentArtifactStorageManifest = {
    ...library.storageManifest,
    generatedAt: new Date().toISOString(),
    uploadStatus: "stored",
    files: uploadedFiles
  };

  await fs.writeFile(
    getArtifactStorageManifestPath(config.artifactLibraryDir),
    JSON.stringify(storageManifest, null, 2),
    "utf8"
  );

  return { ...library, storageManifest };
}

export function retrieveArtifacts(
  benchmarkCase: AgentBenchmarkCase,
  artifacts: AgentKnowledgeArtifact[],
  limit: number,
  minScore: number
) {
  const titleTokens = new Set(tokenizeForRetrieval(benchmarkCase.title));
  const issueTokens = new Set(tokenizeForRetrieval(benchmarkCase.userPrompt));
  const artifactDomain = expectedArtifactDomainForBenchmarkCase(benchmarkCase);

  return [...artifacts]
    .filter((artifact) => artifact.frontmatter.domain === artifactDomain)
    .map((artifact) => ({
      artifact,
      score: scoreArtifact(titleTokens, issueTokens, artifact)
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.artifact.version !== left.artifact.version) {
        return right.artifact.version - left.artifact.version;
      }

      return left.artifact.artifactId.localeCompare(right.artifact.artifactId);
    })
    .slice(0, limit)
    .map((entry) => entry.artifact);
}

export function buildArtifactManifestEntry(artifact: AgentKnowledgeArtifact): AgentArtifactManifest {
  return {
    artifactId: artifact.artifactId,
    benchmarkCaseId: artifact.benchmarkCaseId,
    version: artifact.version,
    fileName: artifact.fileName,
    title: artifact.frontmatter.title,
    tags: artifact.frontmatter.tags,
    retrievalText: artifact.retrievalText,
    contentHash: artifact.frontmatter.storage.contentHash,
    sourceRunId: artifact.frontmatter.provenance.sourceRunId,
    artifactUri: artifact.frontmatter.storage.artifactUri
  };
}

export function buildArtifactStorageManifest(
  config: Pick<AgentConfig, "artifactLibraryDir" | "artifactManifestPath">,
  artifacts: AgentKnowledgeArtifact[],
  context: {
    runId?: string;
    suiteLabel?: string;
    generatedAt?: string;
  } = {}
): AgentArtifactStorageManifest {
  return {
    schemaVersion: STORAGE_MANIFEST_SCHEMA_VERSION,
    generatedAt: context.generatedAt ?? new Date().toISOString(),
    runId: context.runId ?? null,
    suiteLabel: context.suiteLabel ?? null,
    storageProvider: "WALRUS",
    uploadStatus: "prepared",
    artifactCount: artifacts.length,
    artifactLibraryDir: config.artifactLibraryDir,
    artifactManifestPath: config.artifactManifestPath,
    files: artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      benchmarkCaseId: artifact.benchmarkCaseId,
      version: artifact.version,
      fileName: artifact.fileName,
      relativePath: path.posix.join(ARTIFACT_DIRECTORY_NAME, artifact.fileName),
      contentHash: artifact.frontmatter.storage.contentHash,
      artifactUri: artifact.frontmatter.storage.artifactUri,
      storageUri: null,
      storageHash: null,
      blobId: null,
      registrationTransactionDigest: null,
      tags: artifact.frontmatter.tags,
      retrievalText: artifact.retrievalText
    }))
  };
}

export function getArtifactLibraryArtifactsDir(artifactLibraryDir: string) {
  return path.join(artifactLibraryDir, ARTIFACT_DIRECTORY_NAME);
}

export function getArtifactStorageManifestPath(artifactLibraryDir: string) {
  return path.join(artifactLibraryDir, STORAGE_MANIFEST_FILE_NAME);
}

export function parseArtifactFrontmatter(markdown: string): AgentArtifactFrontmatter {
  const lines = markdown.split("\n");

  if (lines[0] !== "---") {
    throw new Error("Artifact markdown is missing the opening frontmatter delimiter");
  }

  const closingIndex = lines.indexOf("---", 1);

  if (closingIndex === -1) {
    throw new Error("Artifact markdown is missing the closing frontmatter delimiter");
  }

  const frontmatterText = lines.slice(1, closingIndex).join("\n");
  return JSON.parse(frontmatterText) as AgentArtifactFrontmatter;
}

interface ArtifactContentInput {
  benchmarkCase: AgentBenchmarkCase;
  issues: AgentEvaluationIssue[];
  domain: "support" | "excel";
}

function buildArtifactContentHash(input: ArtifactContentInput) {
  if (input.domain === "excel") {
    if (!isExcelBenchmarkCase(input.benchmarkCase)) {
      throw new Error(`Benchmark case ${input.benchmarkCase.id} is not an Excel benchmark case`);
    }

    const excelCase = input.benchmarkCase;

    return sha256Hex(
      JSON.stringify({
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        artifactId: sha256Hex(`artifact:${input.benchmarkCase.id}`),
        benchmarkCaseId: input.benchmarkCase.id,
        title: input.benchmarkCase.title,
        domain: "excel-qna",
        issuePattern: input.benchmarkCase.userPrompt,
        formulaPattern: excelCase.expectedFormula,
        concepts: excelCase.requiredConcepts || [],
        difficulty: excelCase.difficulty,
        expectedAnswer: excelCase.expectedAnswer,
        exampleInputs: [input.benchmarkCase.userPrompt],
        tags: buildArtifactTags(input.benchmarkCase, input.domain),
        sourceFailureCodes: input.issues.map((issue) => issue.code)
      })
    );
  }

  if (!isSupportBenchmarkCase(input.benchmarkCase)) {
    throw new Error(`Benchmark case ${input.benchmarkCase.id} is not a support benchmark case`);
  }

  const supportCase = input.benchmarkCase;

  return sha256Hex(
    JSON.stringify({
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      artifactId: sha256Hex(`artifact:${input.benchmarkCase.id}`),
      benchmarkCaseId: input.benchmarkCase.id,
      title: input.benchmarkCase.title,
      domain: "builder-support",
      issuePattern: input.benchmarkCase.userPrompt,
      category: supportCase.expected.category,
      classification: supportCase.expected.category,
      severity: supportCase.expected.severity,
      requiresHuman: supportCase.expected.requiresHuman,
      summary: supportCase.expected.summary,
      resolutionSteps: buildResolutionSteps(supportCase.expected.suggestedResolution),
      exampleInputs: [input.benchmarkCase.userPrompt],
      tags: buildArtifactTags(input.benchmarkCase, input.domain),
      sourceFailureCodes: input.issues.map((issue) => issue.code)
    })
  );
}

function renderArtifactMarkdown(frontmatter: AgentArtifactFrontmatter, summary: string, domain: "support" | "excel") {
  const resolutionSteps = frontmatter.resolutionSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const exampleInputs = frontmatter.exampleInputs.map((example) => `- ${example}`).join("\n");
  const failureCodes = frontmatter.provenance.failureCodes.map((code) => `- ${code}`).join("\n");
  const tagLine = frontmatter.tags.join(", ");

  if (domain === "excel") {
    const concepts = frontmatter.concepts?.join(", ") || "N/A";
    return [
      "---",
      JSON.stringify(frontmatter, null, 2),
      "---",
      "",
      `# ${frontmatter.title}`,
      "",
      "## Domain",
      frontmatter.domain,
      "",
      "## Question Pattern",
      frontmatter.issuePattern,
      "",
      "## Formula Pattern",
      frontmatter.formulaPattern || "N/A",
      "",
      "## Required Concepts",
      concepts,
      "",
      "## Difficulty",
      frontmatter.difficulty || "N/A",
      "",
      "## Recommended Answer",
      summary,
      "",
      "## Resolution Steps",
      resolutionSteps,
      "",
      "## Examples",
      exampleInputs,
      "",
      "## Provenance",
      `Source run: ${frontmatter.provenance.sourceRunId}`,
      `Benchmark case: ${frontmatter.provenance.benchmarkCaseId}`,
      `Generated at: ${frontmatter.provenance.generatedAt}`,
      "Failure codes:",
      failureCodes,
      "",
      "## Version Metadata",
      `Artifact ID: ${frontmatter.artifactId}`,
      `Version: ${frontmatter.version}`,
      `Schema version: ${frontmatter.schemaVersion}`,
      `Content hash: ${frontmatter.storage.contentHash}`,
      `Artifact URI: ${frontmatter.storage.artifactUri ?? "n/a"}`,
      `Tags: ${tagLine}`
    ].join("\n");
  }

  return [
    "---",
    JSON.stringify(frontmatter, null, 2),
    "---",
    "",
    `# ${frontmatter.title}`,
    "",
    "## Domain",
    frontmatter.domain,
    "",
    "## Issue Pattern",
    frontmatter.issuePattern,
    "",
    "## Classification",
    `Category: ${frontmatter.category}`,
    `Classification: ${frontmatter.classification}`,
    "",
    "## Severity",
    frontmatter.severity,
    "",
    "## Human Escalation",
    frontmatter.requiresHuman ? "Required" : "Not required",
    "",
    "## Recommended Resolution Steps",
    resolutionSteps,
    "",
    "## Examples",
    exampleInputs,
    "",
    "## Summary",
    summary,
    "",
    "## Provenance",
    `Source run: ${frontmatter.provenance.sourceRunId}`,
    `Benchmark case: ${frontmatter.provenance.benchmarkCaseId}`,
    `Generated at: ${frontmatter.provenance.generatedAt}`,
    "Failure codes:",
    failureCodes,
    "",
    "## Version Metadata",
    `Artifact ID: ${frontmatter.artifactId}`,
    `Version: ${frontmatter.version}`,
    `Schema version: ${frontmatter.schemaVersion}`,
    `Content hash: ${frontmatter.storage.contentHash}`,
    `Artifact URI: ${frontmatter.storage.artifactUri ?? "n/a"}`,
    `Tags: ${tagLine}`
  ].join("\n");
}

function buildArtifactTags(benchmarkCase: AgentBenchmarkCase, domain: "support" | "excel") {
  if (domain === "excel") {
    if (!isExcelBenchmarkCase(benchmarkCase)) {
      throw new Error(`Benchmark case ${benchmarkCase.id} is not an Excel benchmark case`);
    }

    const baseTags = [
      benchmarkCase.difficulty,
      ...benchmarkCase.tags,
      ...(benchmarkCase.requiredConcepts || []).map((concept) => concept.toLowerCase()),
      ...tokenizeForRetrieval(benchmarkCase.title),
      ...tokenizeForRetrieval(benchmarkCase.userPrompt)
    ];
    return Array.from(new Set(baseTags.filter(Boolean))).slice(0, 12);
  }

  if (!isSupportBenchmarkCase(benchmarkCase)) {
    throw new Error(`Benchmark case ${benchmarkCase.id} is not a support benchmark case`);
  }

  const baseTags = [
    benchmarkCase.expected.category.toLowerCase(),
    benchmarkCase.expected.severity,
    ...tokenizeForRetrieval(benchmarkCase.title),
    ...tokenizeForRetrieval(benchmarkCase.userPrompt)
  ];
  return Array.from(new Set(baseTags.filter(Boolean))).slice(0, 12);
}

function buildResolutionSteps(suggestedResolution: string) {
  const sentences = suggestedResolution
    .split(/\.(?:\s+|$)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return [suggestedResolution.trim()];
  }

  return sentences.map((sentence) => (sentence.endsWith(".") ? sentence : `${sentence}.`));
}

function buildRetrievalText(frontmatter: AgentArtifactFrontmatter) {
  return [
    frontmatter.title,
    frontmatter.issuePattern,
    frontmatter.category,
    frontmatter.classification,
    frontmatter.severity,
    frontmatter.formulaPattern,
    frontmatter.concepts?.join(" "),
    frontmatter.difficulty,
    frontmatter.tags.join(" "),
    frontmatter.exampleInputs.join(" "),
    frontmatter.resolutionSteps.join(" ")
  ]
    .join(" ")
    .toLowerCase();
}

function buildArtifactFileName(benchmarkCaseId: string, version: number) {
  return `${benchmarkCaseId}.v${version}.artifact.md`;
}

function scoreArtifact(
  titleTokens: Set<string>,
  issueTokens: Set<string>,
  artifact: AgentKnowledgeArtifact
) {
  const titleScore = countTokenOverlap(titleTokens, tokenizeForRetrieval(artifact.frontmatter.title)) * 4;
  const issueScore = countTokenOverlap(issueTokens, tokenizeForRetrieval(artifact.frontmatter.issuePattern)) * 3;
  const tagScore = countTokenOverlap(
    issueTokens,
    artifact.frontmatter.tags.flatMap((tag) => tokenizeForRetrieval(tag))
  ) * 2;
  const classificationScore = countTokenOverlap(
    issueTokens,
    tokenizeForRetrieval(`${artifact.frontmatter.category} ${artifact.frontmatter.classification}`)
  ) * 2;
  const exampleScore = countTokenOverlap(
    issueTokens,
    artifact.frontmatter.exampleInputs.flatMap((example) => tokenizeForRetrieval(example))
  );

  return titleScore + issueScore + tagScore + classificationScore + exampleScore;
}

function countTokenOverlap(queryTokens: Set<string>, candidateTokens: string[]) {
  let score = 0;
  const uniqueCandidateTokens = new Set(candidateTokens);

  for (const token of queryTokens) {
    if (uniqueCandidateTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function tokenizeForRetrieval(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4 && !RETRIEVAL_STOPWORDS.has(token));
}

async function loadArtifactManifest(filePath: string) {
  try {
    const manifestText = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(manifestText) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("Artifact manifest must be an array");
    }

    return parsed as AgentArtifactManifest[];
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}
