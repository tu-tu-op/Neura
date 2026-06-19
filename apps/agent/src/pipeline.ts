import fs from "node:fs/promises";
import path from "node:path";

import {
  SUPPORT_CATEGORIES,
  SUPPORT_SEVERITIES,
  type AgentBenchmarkCase,
  type AgentBenchmarkCaseRun,
  type AgentBenchmarkComparison,
  type AgentCorrectionRecord,
  type AgentEvaluationIssue,
  type AgentFailureRecord,
  type AgentKnowledgeArtifact,
  type AgentRunSummary,
  type AgentStructuredResponse,
  type AgentTrainingExample,
  type ExcelBenchmarkCase,
  type ExcelStructuredResponse,
  type SupportBenchmarkCase,
  type SupportStructuredResponse
} from "@dataloop/shared";

import {
  buildKnowledgeArtifact,
  loadArtifactLibrary,
  mergeArtifactSets,
  persistArtifactLibrary,
  retrieveArtifacts,
  uploadArtifactLibraryToStorage,
  type ArtifactLibrary
} from "./artifacts";
import type { AgentConfig } from "./config";
import { createAgentModel, type AgentModel } from "./model";
import { publishFailuresToPlatform, type PublishResult } from "./platform";
import {
  artifactDomainForAgentDomain,
  buildExpectedExcelResponse,
  buildExpectedStructuredResponse,
  isExcelBenchmarkCase,
  isSupportBenchmarkCase
} from "./responses";

export interface AgentRunResult {
  runId: string;
  suiteLabel: string;
  outputPath: string;
  summary: AgentRunSummary;
  baselineRuns: AgentBenchmarkCaseRun[];
  artifactRuns: AgentBenchmarkCaseRun[];
  comparisons: AgentBenchmarkComparison[];
  failures: AgentFailureRecord[];
  corrections: AgentCorrectionRecord[];
  artifacts: AgentKnowledgeArtifact[];
  publishResult: PublishResult;
}

export async function runAgentBenchmark(config: AgentConfig): Promise<AgentRunResult> {
  const benchmarkCases = await loadBenchmarkCases(config.benchmarkPath, config.domain);
  const runId = new Date().toISOString().replaceAll(":", "-");
  const suiteLabel = path.basename(config.benchmarkPath, path.extname(config.benchmarkPath));
  const outputPath = path.join(config.outputDir, runId);
  const model = createAgentModel(config);

  await fs.mkdir(outputPath, { recursive: true });

  const existingLibrary = await loadArtifactLibrary(config);
  const baselineRuns = await runBenchmarkCases(model, benchmarkCases, config.minConfidence, () => [], config.domain);
  const { failures, corrections, artifacts } = buildFailureAndCorrectionRecords(
    runId,
    benchmarkCases,
    baselineRuns,
    existingLibrary,
    config.minConfidence,
    config.domain
  );
  const persistedLibrary = await promoteArtifacts(config, existingLibrary, artifacts, {
    runId,
    suiteLabel
  });
  const artifactRuns = await runBenchmarkCases(
    model,
    benchmarkCases,
    config.minConfidence,
    (benchmarkCase) => retrieveArtifacts(
      benchmarkCase,
      persistedLibrary.artifacts,
      config.retrievalLimit,
      config.retrievalMinScore
    ),
    config.domain
  );
  const comparisons = buildComparisons(baselineRuns, artifactRuns);
  const publishResult = await publishFailuresToPlatform(
    config,
    runId,
    suiteLabel,
    failures,
    corrections,
    {
      artifactManifest: persistedLibrary.manifest
    }
  );

  await writeRunArtifacts(
    outputPath,
    benchmarkCases,
    failures,
    corrections,
    persistedLibrary,
    baselineRuns,
    artifactRuns,
    comparisons,
    publishResult,
    config
  );

  const baselinePassedCount = baselineRuns.filter((run) => run.evaluation.passed).length;
  const artifactPassedCount = artifactRuns.filter((run) => run.evaluation.passed).length;

  return {
    runId,
    suiteLabel,
    outputPath,
    summary: {
      benchmarkCaseCount: benchmarkCases.length,
      baselinePassedCount,
      baselineFailedCount: benchmarkCases.length - baselinePassedCount,
      artifactPassedCount,
      artifactFailedCount: benchmarkCases.length - artifactPassedCount,
      improvedCount: comparisons.filter((item) => item.improved).length,
      artifactCount: artifacts.length,
      publishedTaskCount: publishResult.publishedTaskCount,
      publishedCorrectionCount: publishResult.publishedCorrectionCount,
      registeredDatasetVersion: publishResult.registeredDatasetVersion
    },
    baselineRuns,
    artifactRuns,
    comparisons,
    failures,
    corrections,
    artifacts,
    publishResult
  };
}

async function loadBenchmarkCases(filePath: string, domain: "support" | "excel") {
  const file = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(file) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Benchmark file must contain an array");
  }

  const benchmarkCases = parsed as AgentBenchmarkCase[];
  validateBenchmarkCases(benchmarkCases, domain, filePath);

  return benchmarkCases;
}

function validateBenchmarkCases(
  benchmarkCases: AgentBenchmarkCase[],
  domain: "support" | "excel",
  filePath: string
) {
  const invalidCaseIds = benchmarkCases
    .filter((benchmarkCase) =>
      domain === "excel" ? !isExcelBenchmarkCase(benchmarkCase) : !isSupportBenchmarkCase(benchmarkCase)
    )
    .map((benchmarkCase) => benchmarkCase.id ?? "<missing id>");

  if (invalidCaseIds.length > 0) {
    throw new Error(
      `Benchmark file ${filePath} contains ${invalidCaseIds.length} case(s) that do not match AGENT_DOMAIN=${domain}: ${invalidCaseIds.join(", ")}`
    );
  }
}

async function runBenchmarkCases(
  model: AgentModel,
  benchmarkCases: AgentBenchmarkCase[],
  minConfidence: number,
  getRetrievedArtifacts: (benchmarkCase: AgentBenchmarkCase) => AgentKnowledgeArtifact[],
  domain: "support" | "excel"
) {
  const runs: AgentBenchmarkCaseRun[] = [];

  for (const benchmarkCase of benchmarkCases) {
    runs.push(
      await executeBenchmarkCase(
        model,
        benchmarkCase,
        minConfidence,
        getRetrievedArtifacts(benchmarkCase),
        domain
      )
    );
  }

  return runs;
}

function buildFailureAndCorrectionRecords(
  runId: string,
  benchmarkCases: AgentBenchmarkCase[],
  baselineRuns: AgentBenchmarkCaseRun[],
  existingLibrary: ArtifactLibrary,
  minConfidence: number,
  domain: "support" | "excel"
) {
  const benchmarkCasesById = new Map(benchmarkCases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]));
  const expectedArtifactDomain = artifactDomainForAgentDomain(domain);
  const existingArtifactsByCaseId = new Map(
    existingLibrary.artifacts
      .filter((artifact) => artifact.frontmatter.domain === expectedArtifactDomain)
      .map((artifact) => [artifact.benchmarkCaseId, artifact])
  );
  const failures: AgentFailureRecord[] = [];
  const corrections: AgentCorrectionRecord[] = [];
  const artifacts: AgentKnowledgeArtifact[] = [];

  for (const baselineRun of baselineRuns) {
    if (baselineRun.evaluation.passed) {
      continue;
    }

    const benchmarkCase = benchmarkCasesById.get(baselineRun.benchmarkCaseId);

    if (benchmarkCase === undefined) {
      throw new Error(`Benchmark case ${baselineRun.benchmarkCaseId} was not found`);
    }

    const failureRecord: AgentFailureRecord = {
      runId,
      benchmarkCase,
      rawModelOutput: baselineRun.rawModelOutput,
      parsedModelOutput: baselineRun.parsedModelOutput,
      evaluation: {
        passed: false,
        issues: baselineRun.evaluation.issues
      }
    };
    const existingArtifact = existingArtifactsByCaseId.get(benchmarkCase.id);
    const knowledgeArtifact = buildKnowledgeArtifact({
      runId,
      benchmarkCase,
      issues: baselineRun.evaluation.issues,
      domain,
      ...(existingArtifact ? { existingArtifact } : {})
    });
    const correctionRecord: AgentCorrectionRecord = {
      runId,
      benchmarkCaseId: benchmarkCase.id,
      correctedResponse: buildExpectedStructuredResponse(benchmarkCase),
      knowledgeArtifact,
      trainingExample: buildTrainingExample(benchmarkCase, baselineRun.evaluation.issues, minConfidence, domain),
      sourceFailureCodes: baselineRun.evaluation.issues.map((issue) => issue.code)
    };

    failures.push(failureRecord);
    corrections.push(correctionRecord);
    artifacts.push(knowledgeArtifact);
  }

  return {
    failures,
    corrections,
    artifacts
  };
}

async function promoteArtifacts(
  config: AgentConfig,
  existingLibrary: ArtifactLibrary,
  generatedArtifacts: AgentKnowledgeArtifact[],
  context: {
    runId: string;
    suiteLabel: string;
  }
) {
  const mergedArtifacts = mergeArtifactSets(existingLibrary.artifacts, generatedArtifacts);
  const persistedLibrary = await persistArtifactLibrary(config, mergedArtifacts, context);

  if (!process.env.SUI_AGENT_PRIVATE_KEY?.trim()) {
    return persistedLibrary;
  }

  return uploadArtifactLibraryToStorage(config, persistedLibrary);
}

function buildSystemPrompt(minConfidence: number, domain: "support" | "excel") {
  if (domain === "excel") {
    return [
      "You are an Excel Q&A specialist agent.",
      "Return JSON only with these keys: formula (optional), explanation, confidence.",
      "The formula field should contain the Excel formula when the question asks for one.",
      "The explanation field should explain the formula or answer the question.",
      `Confidence must be a number between 0 and 1 and should stay above ${minConfidence} only when you are genuinely certain.`,
      "If retrieved knowledge artifacts are provided, follow their specialist guidance over generic prior knowledge.",
      "Do not include markdown fences or explanation outside the JSON object."
    ].join(" ");
  }

  return [
    "You are a builder support triage agent.",
    "Return JSON only with these keys: category, severity, requiresHuman, summary, suggestedResolution, confidence.",
    `Valid categories: ${SUPPORT_CATEGORIES.join(", ")}.`,
    `Valid severity values: ${SUPPORT_SEVERITIES.join(", ")}.`,
    `Confidence must be a number between 0 and 1 and should stay above ${minConfidence} only when you are genuinely certain.`,
    "If retrieved knowledge artifacts are provided, follow their specialist guidance over generic prior knowledge.",
    "Do not include markdown fences or explanation outside the JSON object."
  ].join(" ");
}

async function executeBenchmarkCase(
  model: AgentModel,
  benchmarkCase: AgentBenchmarkCase,
  minConfidence: number,
  retrievedArtifacts: AgentKnowledgeArtifact[],
  domain: "support" | "excel"
): Promise<AgentBenchmarkCaseRun> {
  const rawModelOutput = await model.generate({
    systemPrompt: buildSystemPrompt(minConfidence, domain),
    benchmarkCase,
    retrievedArtifacts
  });
  const parsedModelOutput = parseStructuredResponse(rawModelOutput);
  const issues = evaluateResponse(parsedModelOutput, benchmarkCase, minConfidence, domain);

  return {
    benchmarkCaseId: benchmarkCase.id,
    title: benchmarkCase.title,
    retrievedArtifactIds: retrievedArtifacts.map((artifact) => artifact.artifactId),
    rawModelOutput,
    parsedModelOutput,
    evaluation: {
      passed: issues.length === 0,
      issues
    }
  };
}

function parseStructuredResponse(raw: string): AgentStructuredResponse | null {
  const candidate = extractJsonCandidate(raw);

  if (candidate === null) {
    return null;
  }

  try {
    return JSON.parse(candidate) as AgentStructuredResponse;
  } catch {
    return null;
  }
}

function extractJsonCandidate(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function evaluateResponse(
  parsed: AgentStructuredResponse | null,
  benchmarkCase: AgentBenchmarkCase,
  minConfidence: number,
  domain: "support" | "excel"
): AgentEvaluationIssue[] {
  if (parsed === null) {
    return [
      {
        code: "INVALID_JSON",
        message: "Model output could not be parsed as a JSON object."
      }
    ];
  }

  if (domain === "excel") {
    return evaluateExcelResponse(parsed as ExcelStructuredResponse, benchmarkCase as ExcelBenchmarkCase, minConfidence);
  }

  return evaluateSupportResponse(parsed as SupportStructuredResponse, (benchmarkCase as SupportBenchmarkCase).expected, minConfidence);
}

function evaluateSupportResponse(
  parsed: SupportStructuredResponse,
  expected: SupportStructuredResponse,
  minConfidence: number
): AgentEvaluationIssue[] {
  const issues: AgentEvaluationIssue[] = [];

  if (
    !SUPPORT_CATEGORIES.includes(parsed.category) ||
    !SUPPORT_SEVERITIES.includes(parsed.severity) ||
    typeof parsed.requiresHuman !== "boolean" ||
    typeof parsed.summary !== "string" ||
    parsed.summary.trim().length === 0 ||
    typeof parsed.suggestedResolution !== "string" ||
    parsed.suggestedResolution.trim().length === 0 ||
    typeof parsed.confidence !== "number"
  ) {
    issues.push({
      code: "INVALID_SCHEMA",
      message: "Model output did not satisfy the required JSON schema."
    });

    return issues;
  }

  if (parsed.confidence < minConfidence) {
    issues.push({
      code: "LOW_CONFIDENCE",
      message: `Model confidence ${parsed.confidence} was below the minimum threshold ${minConfidence}.`
    });
  }

  if (parsed.category !== expected.category) {
    issues.push({
      code: "CATEGORY_MISMATCH",
      message: `Expected category ${expected.category} but received ${parsed.category}.`
    });
  }

  if (parsed.severity !== expected.severity) {
    issues.push({
      code: "SEVERITY_MISMATCH",
      message: `Expected severity ${expected.severity} but received ${parsed.severity}.`
    });
  }

  if (parsed.requiresHuman !== expected.requiresHuman) {
    issues.push({
      code: "HUMAN_REVIEW_MISMATCH",
      message: `Expected requiresHuman=${String(expected.requiresHuman)} but received ${String(parsed.requiresHuman)}.`
    });
  }

  return issues;
}

function evaluateExcelResponse(
  parsed: ExcelStructuredResponse,
  benchmarkCase: ExcelBenchmarkCase,
  minConfidence: number
): AgentEvaluationIssue[] {
  const issues: AgentEvaluationIssue[] = [];

  if (
    typeof parsed.explanation !== "string" ||
    parsed.explanation.trim().length === 0 ||
    typeof parsed.confidence !== "number" ||
    (parsed.formula !== undefined && typeof parsed.formula !== "string")
  ) {
    issues.push({
      code: "INVALID_SCHEMA",
      message: "Model output did not satisfy the required JSON schema."
    });

    return issues;
  }

  if (parsed.confidence < minConfidence) {
    issues.push({
      code: "LOW_CONFIDENCE",
      message: `Model confidence ${parsed.confidence} was below the minimum threshold ${minConfidence}.`
    });
  }

  // Check formula if expected
  if (benchmarkCase.expectedFormula && benchmarkCase.expectedFormula.trim().length > 0) {
    if (!parsed.formula) {
      issues.push({
        code: "FORMULA_MISMATCH",
        message: "Expected a formula but none was provided."
      });
    } else if (!isFormulaMatch(parsed.formula, benchmarkCase.expectedFormula, benchmarkCase.acceptableAlternatives)) {
      issues.push({
        code: "FORMULA_MISMATCH",
        message: `Formula mismatch. Expected: ${benchmarkCase.expectedFormula}, Got: ${parsed.formula}`
      });
    }
  }

  // Check required concepts
  if (benchmarkCase.requiredConcepts && benchmarkCase.requiredConcepts.length > 0) {
    const missingConcepts = benchmarkCase.requiredConcepts.filter(
      (concept) => !parsed.explanation.toLowerCase().includes(concept.toLowerCase())
    );

    if (missingConcepts.length > 0) {
      issues.push({
        code: "MISSING_CONCEPTS",
        message: `Missing required concepts: ${missingConcepts.join(", ")}`
      });
    }
  }

  return issues;
}

function isFormulaMatch(actual: string, expected: string, alternatives?: string[]): boolean {
  const normalize = (formula: string) =>
    formula.replace(/\s+/g, "").replace(/\$/g, "").toUpperCase();

  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);

  if (normalizedActual === normalizedExpected) {
    return true;
  }

  if (alternatives) {
    return alternatives.some((alt) => normalize(alt) === normalizedActual);
  }

  return false;
}

function buildTrainingExample(
  benchmarkCase: AgentBenchmarkCase,
  issues: AgentEvaluationIssue[],
  minConfidence: number,
  domain: "support" | "excel"
): AgentTrainingExample {
  const assistantContent = domain === "excel"
    ? JSON.stringify(buildExpectedExcelResponse(benchmarkCase as ExcelBenchmarkCase))
    : JSON.stringify((benchmarkCase as SupportBenchmarkCase).expected);

  return {
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(minConfidence, domain)
      },
      {
        role: "user",
        content: benchmarkCase.userPrompt
      },
      {
        role: "assistant",
        content: assistantContent
      }
    ],
    metadata: {
      benchmarkCaseId: benchmarkCase.id,
      benchmarkTitle: benchmarkCase.title,
      failureCodes: issues.map((issue) => issue.code)
    }
  };
}

function buildComparisons(
  baselineRuns: AgentBenchmarkCaseRun[],
  artifactRuns: AgentBenchmarkCaseRun[]
): AgentBenchmarkComparison[] {
  const artifactRunsByCaseId = new Map(artifactRuns.map((run) => [run.benchmarkCaseId, run]));

  return baselineRuns.map((baselineRun) => {
    const artifactRun = artifactRunsByCaseId.get(baselineRun.benchmarkCaseId);

    if (artifactRun === undefined) {
      throw new Error(`Artifact run missing for benchmark case ${baselineRun.benchmarkCaseId}`);
    }

    return {
      benchmarkCaseId: baselineRun.benchmarkCaseId,
      improved: !baselineRun.evaluation.passed && artifactRun.evaluation.passed,
      baselinePassed: baselineRun.evaluation.passed,
      artifactPassed: artifactRun.evaluation.passed,
      retrievedArtifactIds: artifactRun.retrievedArtifactIds
    };
  });
}

async function writeRunArtifacts(
  outputPath: string,
  benchmarkCases: AgentBenchmarkCase[],
  failures: AgentFailureRecord[],
  corrections: AgentCorrectionRecord[],
  persistedLibrary: ArtifactLibrary,
  baselineRuns: AgentBenchmarkCaseRun[],
  artifactRuns: AgentBenchmarkCaseRun[],
  comparisons: AgentBenchmarkComparison[],
  publishResult: PublishResult,
  config: AgentConfig
) {
  const trainingPath = path.join(outputPath, "training.jsonl");
  const reportPath = path.join(outputPath, "run-report.json");
  const comparisonReportPath = path.join(outputPath, "benchmark-comparison.md");
  const artifactDir = path.join(outputPath, "artifacts");
  const manifestSnapshotPath = path.join(outputPath, "artifact-manifest.snapshot.json");
  const storageManifestSnapshotPath = path.join(outputPath, "artifact-storage-manifest.snapshot.json");

  await fs.mkdir(artifactDir, { recursive: true });

  await fs.writeFile(
    trainingPath,
    corrections.map((item) => JSON.stringify(item.trainingExample)).join("\n"),
    "utf8"
  );

  for (const failure of failures) {
    await fs.writeFile(
      path.join(outputPath, `${failure.benchmarkCase.id}.failure.json`),
      JSON.stringify(failure, null, 2),
      "utf8"
    );
  }

  for (const correction of corrections) {
    await fs.writeFile(
      path.join(outputPath, `${correction.benchmarkCaseId}.correction.json`),
      JSON.stringify(correction, null, 2),
      "utf8"
    );
  }

  for (const artifact of persistedLibrary.artifacts) {
    await fs.writeFile(path.join(artifactDir, artifact.fileName), artifact.markdown, "utf8");
  }

  await fs.writeFile(manifestSnapshotPath, JSON.stringify(persistedLibrary.manifest, null, 2), "utf8");
  await fs.writeFile(
    storageManifestSnapshotPath,
    JSON.stringify(persistedLibrary.storageManifest, null, 2),
    "utf8"
  );
  await fs.writeFile(
    comparisonReportPath,
    renderBenchmarkComparisonMarkdown(
      benchmarkCases,
      baselineRuns,
      artifactRuns,
      comparisons,
      persistedLibrary,
      publishResult
    ),
    "utf8"
  );

  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        benchmarkCaseCount: benchmarkCases.length,
        baselinePassedCount: baselineRuns.filter((run) => run.evaluation.passed).length,
        baselineFailedCount: baselineRuns.filter((run) => !run.evaluation.passed).length,
        artifactPassedCount: artifactRuns.filter((run) => run.evaluation.passed).length,
        artifactFailedCount: artifactRuns.filter((run) => !run.evaluation.passed).length,
        improvedCount: comparisons.filter((item) => item.improved).length,
        artifactCount: corrections.length,
        publishResult,
        benchmarkCaseIds: benchmarkCases.map((item) => item.id),
        artifactLibraryDir: config.artifactLibraryDir,
        artifactManifestPath: config.artifactManifestPath,
        artifactLibraryManifest: persistedLibrary.manifest,
        artifactStorageManifest: persistedLibrary.storageManifest,
        comparisonReportPath,
        comparisons,
        baselineRuns,
        artifactRuns
      },
      null,
      2
    ),
    "utf8"
  );
}

function renderBenchmarkComparisonMarkdown(
  benchmarkCases: AgentBenchmarkCase[],
  baselineRuns: AgentBenchmarkCaseRun[],
  artifactRuns: AgentBenchmarkCaseRun[],
  comparisons: AgentBenchmarkComparison[],
  persistedLibrary: ArtifactLibrary,
  publishResult: PublishResult
) {
  const baselineRunsByCaseId = new Map(baselineRuns.map((run) => [run.benchmarkCaseId, run]));
  const artifactRunsByCaseId = new Map(artifactRuns.map((run) => [run.benchmarkCaseId, run]));
  const comparisonsByCaseId = new Map(comparisons.map((comparison) => [comparison.benchmarkCaseId, comparison]));
  const passedBaselineCount = baselineRuns.filter((run) => run.evaluation.passed).length;
  const passedArtifactCount = artifactRuns.filter((run) => run.evaluation.passed).length;
  const improvedCount = comparisons.filter((comparison) => comparison.improved).length;
  const lines = [
    "# Week 2 Benchmark Comparison",
    "",
    "## Summary",
    "",
    `- Benchmark cases: ${benchmarkCases.length}`,
    `- Baseline passed: ${passedBaselineCount}`,
    `- Artifact-augmented passed: ${passedArtifactCount}`,
    `- Improved cases: ${improvedCount}`,
    `- Knowledge artifacts available: ${persistedLibrary.artifacts.length}`,
    `- Published tasks: ${publishResult.publishedTaskCount}`,
    `- Published corrections: ${publishResult.publishedCorrectionCount}`,
    `- Dataset registered: ${String(publishResult.registeredDatasetVersion)}`,
    "",
    "## Artifact Storage Bundle",
    "",
    `- Storage provider target: ${persistedLibrary.storageManifest.storageProvider}`,
    `- Upload status: ${persistedLibrary.storageManifest.uploadStatus}`,
    `- Storage manifest schema: ${persistedLibrary.storageManifest.schemaVersion}`,
    `- Files prepared: ${persistedLibrary.storageManifest.files.length}`,
    "",
    "## Cases"
  ];

  for (const benchmarkCase of benchmarkCases) {
    const baselineRun = baselineRunsByCaseId.get(benchmarkCase.id);
    const artifactRun = artifactRunsByCaseId.get(benchmarkCase.id);
    const comparison = comparisonsByCaseId.get(benchmarkCase.id);

    if (baselineRun === undefined || artifactRun === undefined || comparison === undefined) {
      throw new Error(`Comparison report is missing run data for benchmark case ${benchmarkCase.id}`);
    }

    const expectedOutput = isSupportBenchmarkCase(benchmarkCase)
      ? benchmarkCase.expected
      : {
          ...buildExpectedExcelResponse(benchmarkCase),
          concepts: benchmarkCase.requiredConcepts
        };

    lines.push(
      "",
      `### ${benchmarkCase.title}`,
      "",
      `- Case ID: ${benchmarkCase.id}`,
      `- Baseline: ${formatRunStatus(baselineRun)}`,
      `- With artifacts: ${formatRunStatus(artifactRun)}`,
      `- Improved: ${String(comparison.improved)}`,
      `- Retrieved artifacts: ${formatRetrievedArtifactIds(artifactRun.retrievedArtifactIds)}`,
      "",
      "Expected output:",
      "",
      formatJsonBlock(expectedOutput),
      "",
      "Baseline output:",
      "",
      formatTextBlock(baselineRun.rawModelOutput),
      "",
      "Artifact-augmented output:",
      "",
      formatTextBlock(artifactRun.rawModelOutput)
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatRunStatus(run: AgentBenchmarkCaseRun) {
  if (run.evaluation.passed) {
    return "passed";
  }

  const issueCodes = run.evaluation.issues.map((issue) => issue.code).join(", ");
  return `failed (${issueCodes})`;
}

function formatRetrievedArtifactIds(artifactIds: string[]) {
  if (artifactIds.length === 0) {
    return "none";
  }

  return artifactIds.join(", ");
}

function formatJsonBlock(value: unknown) {
  return ["~~~json", JSON.stringify(value, null, 2), "~~~"].join("\n");
}

function formatTextBlock(value: string) {
  return ["~~~text", value, "~~~"].join("\n");
}
