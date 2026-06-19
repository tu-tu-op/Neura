import type {
  AgentArtifactFrontmatter,
  AgentBenchmarkCase,
  AgentStructuredResponse,
  ExcelBenchmarkCase,
  ExcelStructuredResponse,
  SupportBenchmarkCase
} from "@dataloop/shared";

import type { AgentDomain } from "./config";

export function isSupportBenchmarkCase(benchmarkCase: AgentBenchmarkCase): benchmarkCase is SupportBenchmarkCase {
  return "expected" in benchmarkCase;
}

export function isExcelBenchmarkCase(benchmarkCase: AgentBenchmarkCase): benchmarkCase is ExcelBenchmarkCase {
  return "expectedAnswer" in benchmarkCase;
}

export function artifactDomainForAgentDomain(domain: AgentDomain): AgentArtifactFrontmatter["domain"] {
  return domain === "excel" ? "excel-qna" : "builder-support";
}

export function expectedArtifactDomainForBenchmarkCase(
  benchmarkCase: AgentBenchmarkCase
): AgentArtifactFrontmatter["domain"] {
  return isExcelBenchmarkCase(benchmarkCase) ? "excel-qna" : "builder-support";
}

export function buildExpectedExcelResponse(
  benchmarkCase: ExcelBenchmarkCase,
  confidence = 0.93
): ExcelStructuredResponse {
  const response: ExcelStructuredResponse = {
    explanation: benchmarkCase.expectedAnswer,
    confidence
  };

  if (benchmarkCase.expectedFormula !== undefined && benchmarkCase.expectedFormula.trim().length > 0) {
    response.formula = benchmarkCase.expectedFormula;
  }

  return response;
}

export function buildExpectedStructuredResponse(
  benchmarkCase: AgentBenchmarkCase,
  confidence?: number
): AgentStructuredResponse {
  if (isSupportBenchmarkCase(benchmarkCase)) {
    return benchmarkCase.expected;
  }

  return buildExpectedExcelResponse(benchmarkCase, confidence);
}
