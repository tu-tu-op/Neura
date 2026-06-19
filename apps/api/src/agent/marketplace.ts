import { buildPreparedStorageProof, hashArtifactContent } from "./storage";
import type { AgentArtifactDomain, AgentArtifactResource } from "./types";

const seedTimestamp = "2026-05-05T00:00:00.000Z";

export interface KnowledgeArtifactCase {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  questionPattern: string;
  formulaPattern: string;
  concepts: string[];
  answer: string;
  rawFormula: string | null;
  rawAnswer: string;
  usageCount: number;
  benchmarkScore: number;
}

export type ExcelArtifactCase = KnowledgeArtifactCase;
export type SuiArtifactCase = KnowledgeArtifactCase;

export const excelArtifactCases: ExcelArtifactCase[] = [
  {
    id: "sumifs-multi-condition",
    title: "SUMIFS with multiple criteria",
    difficulty: "medium",
    tags: ["aggregation", "sumifs", "date criteria"],
    questionPattern:
      "In a sales table with dates in A, regions in B, amounts in C, what formula sums sales in 'North' region after 2024-01-01?",
    formulaPattern: '=SUMIFS(C:C, B:B, "North", A:A, ">2024-01-01")',
    concepts: ["SUMIFS", "date criteria"],
    answer: "Use SUMIFS with date criteria for multi-condition aggregation.",
    rawFormula: '=SUMIFS(C:C,B:B,"North",A:A,">2024-01-01")',
    rawAnswer: "Sums North region sales after Jan 1, 2024 using date criteria.",
    usageCount: 421,
    benchmarkScore: 0.95
  },
  {
    id: "xlookup-basics",
    title: "Basic XLOOKUP lookup",
    difficulty: "easy",
    tags: ["lookup", "xlookup", "exact match"],
    questionPattern:
      "Given employee names in column A and salaries in column B, what formula looks up the salary for John Doe from A1:B10?",
    formulaPattern: '=XLOOKUP("John Doe", A1:A10, B1:B10)',
    concepts: ["XLOOKUP", "exact match"],
    answer: "Use XLOOKUP to find the salary for the exact match.",
    rawFormula: '=XLOOKUP("John Doe",A1:A10,B1:B10)',
    rawAnswer: "XLOOKUP finds the salary for John Doe.",
    usageCount: 318,
    benchmarkScore: 0.92
  },
  {
    id: "filter-dynamic-array",
    title: "FILTER spilled array",
    difficulty: "medium",
    tags: ["dynamic arrays", "filter", "spill"],
    questionPattern: "Filter sales table A:C for amounts over 1000 and return region and amount columns.",
    formulaPattern: "=FILTER(B:C, C:C>1000)",
    concepts: ["FILTER", "spill"],
    answer: "Use dynamic array FILTER; the result will spill into adjacent cells.",
    rawFormula: "=FILTER(B:C,C:C>1000)",
    rawAnswer: "Filters rows where amounts are over 1000.",
    usageCount: 256,
    benchmarkScore: 0.9
  },
  {
    id: "absolute-ref-mistake",
    title: "Fix absolute reference error",
    difficulty: "medium",
    tags: ["debugging", "absolute references", "$ syntax"],
    questionPattern: "Formula =A$1*B1 copied down changes wrong. Why and how to fix for column totals?",
    formulaPattern: "=A$1*B1 for row copy, =$A1*B1 for column copy, =$A$1*$B1 for fixed.",
    concepts: ["absolute references", "$ syntax"],
    answer: "Use absolute references with $ syntax to control whether rows, columns, or both stay fixed.",
    rawFormula: null,
    rawAnswer: "Use $ to lock row or column when copying.",
    usageCount: 177,
    benchmarkScore: 0.88
  },
  {
    id: "vlookup-limitations",
    title: "When not to use VLOOKUP",
    difficulty: "easy",
    tags: ["explanation", "vlookup", "xlookup"],
    questionPattern: "Why avoid VLOOKUP? When should I use XLOOKUP instead?",
    formulaPattern: "",
    concepts: ["VLOOKUP limitations", "XLOOKUP advantages"],
    answer:
      "VLOOKUP limitations include one-way lookup direction and fragile column indexes; XLOOKUP advantages include exact-match defaults, left/right lookup, and cleaner return arrays.",
    rawFormula: null,
    rawAnswer: "VLOOKUP is older and XLOOKUP is usually easier.",
    usageCount: 203,
    benchmarkScore: 0.89
  },
  {
    id: "text-numbers-sum",
    title: "Sum text-formatted numbers",
    difficulty: "easy",
    tags: ["debugging", "value", "text numbers"],
    questionPattern: "Column A looks like numbers but SUM(A:A) is 0. Fix the formula.",
    formulaPattern: "=SUM(VALUE(A:A))",
    concepts: ["VALUE"],
    answer: "Use VALUE for text to number conversion before summing.",
    rawFormula: "=SUM(A:A)",
    rawAnswer: "Try SUM on the column after checking formatting.",
    usageCount: 141,
    benchmarkScore: 0.86
  }
];

export const suiArtifactCases: SuiArtifactCase[] = [
  {
    id: "sui-stack-overview",
    title: "Sui stack overview",
    difficulty: "easy",
    tags: ["sui", "move", "objects", "ai agents", "layer 1"],
    questionPattern: "What is Sui and what are the core components of its stack?",
    formulaPattern: "",
    concepts: ["Sui", "Move", "object-centric data model", "programmable transaction blocks", "Walrus Storage"],
    answer:
      "Sui is a Layer 1 smart-contract platform built around the Move language and an object-centric data model. Applications compose owned and shared objects through programmable transaction blocks, while Walrus provides decentralized blob storage coordinated through Sui. Use this answer for the high-level Sui application stack.\n\nSources: https://docs.sui.io/concepts/object-model and https://docs.wal.app/",
    rawFormula: null,
    rawAnswer:
      "Sui is a blockchain for applications and digital assets. A generic answer may omit Move, object ownership, transaction composition, or Walrus integration.",
    usageCount: 362,
    benchmarkScore: 0.93
  },
  {
    id: "sui-object-model",
    title: "Sui object model and ownership",
    difficulty: "medium",
    tags: ["sui", "objects", "ownership", "shared objects", "parallel execution"],
    questionPattern: "How does Sui's object model affect ownership and transaction execution?",
    formulaPattern: "",
    concepts: ["owned objects", "shared objects", "immutable objects", "object IDs", "parallel execution"],
    answer:
      "On Sui, assets and application state are objects with unique IDs and explicit ownership. Owned objects can be used only by their owner, shared objects are available to multiple users under Move rules, and immutable objects can be read by anyone but not changed. Transactions that touch independent owned objects can execute in parallel.\n\nSource: https://docs.sui.io/concepts/object-model",
    rawFormula: null,
    rawAnswer:
      "Sui stores application state as objects. A generic answer may not distinguish owned, shared, and immutable object behavior.",
    usageCount: 289,
    benchmarkScore: 0.91
  },
  {
    id: "walrus-storage-sdk",
    title: "Walrus Storage and SDK",
    difficulty: "medium",
    tags: ["sui", "walrus", "storage", "blob", "sdk", "publisher", "aggregator"],
    questionPattern: "How does Walrus Storage work and how do I upload or retrieve a blob?",
    formulaPattern: "",
    concepts: ["Walrus Storage", "blob ID", "publisher", "aggregator", "TypeScript SDK"],
    answer:
      "Walrus stores binary large objects as decentralized blobs and uses Sui for coordination. In TypeScript, `@mysten/walrus` can write blobs with a Sui client and signer. Publisher HTTP endpoints accept uploads, aggregator endpoints retrieve blobs, and the returned blob ID is the durable lookup key. Neura stores that ID in a `walrus://` URI.\n\nSources: https://docs.wal.app/usage/web-api.html and https://sdk.mystenlabs.com/walrus",
    rawFormula: null,
    rawAnswer:
      "Walrus provides decentralized blob storage. A generic answer may omit the blob ID, publisher, aggregator, or Sui coordination details.",
    usageCount: 334,
    benchmarkScore: 0.92
  },
  {
    id: "sui-move-packages",
    title: "Sui Move packages",
    difficulty: "medium",
    tags: ["sui", "move", "package", "module", "publish", "upgrade"],
    questionPattern: "How are smart contracts organized and published on Sui?",
    formulaPattern: "",
    concepts: ["Move package", "Move module", "publish transaction", "package ID", "upgrade capability"],
    answer:
      "Sui smart contracts are written as Move modules grouped into packages. Publishing a package creates an immutable package object with a package ID used by clients when calling entry functions. Package upgrades are controlled by an upgrade capability and compatibility policy.\n\nSources: https://docs.sui.io/concepts/sui-move-concepts/packages and https://docs.sui.io/guides/developer/first-app/publish",
    rawFormula: null,
    rawAnswer:
      "Sui contracts use Move packages. A generic answer may omit package IDs, modules, publish transactions, or upgrade capabilities.",
    usageCount: 271,
    benchmarkScore: 0.9
  },
  {
    id: "sui-programmable-transactions",
    title: "Sui programmable transaction blocks",
    difficulty: "medium",
    tags: ["sui", "transactions", "ptb", "gas", "move calls", "composition"],
    questionPattern: "What is a programmable transaction block on Sui and when should a developer use one?",
    formulaPattern: "",
    concepts: ["programmable transaction block", "Move calls", "object inputs", "gas coin", "atomic execution"],
    answer:
      "A programmable transaction block composes multiple commands, such as Move calls, coin operations, and object transfers, into one atomic Sui transaction. Developers use PTBs when a workflow needs several dependent operations to succeed or fail together while sharing intermediate results.\n\nSource: https://docs.sui.io/concepts/transactions/prog-txn-blocks",
    rawFormula: null,
    rawAnswer:
      "Sui transactions can contain multiple operations. A generic answer may omit atomic composition, shared results, and object inputs.",
    usageCount: 247,
    benchmarkScore: 0.91
  }
];

const excelConcepts = unique(excelArtifactCases.flatMap((artifactCase) => artifactCase.concepts));
const excelTags = unique(excelArtifactCases.flatMap((artifactCase) => artifactCase.tags));
const excelFileBody = buildExcelArtifactFileBody(excelArtifactCases);
const suiConcepts = unique(suiArtifactCases.flatMap((artifactCase) => artifactCase.concepts));
const suiTags = unique(suiArtifactCases.flatMap((artifactCase) => artifactCase.tags));
const suiFileBody = buildSuiArtifactFileBody(suiArtifactCases);

export const marketplaceArtifacts: AgentArtifactResource[] = [
  createMarketplaceArtifact({
    id: "excel",
    title: "Excel artifact pack",
    domain: "excel",
    difficulty: "medium",
    tags: ["excel", "formula library", ...excelTags].slice(0, 18),
    questionPattern: excelArtifactCases.map((artifactCase) => artifactCase.questionPattern).join("\n"),
    formulaPattern: "See excel.md",
    concepts: excelConcepts,
    answer: excelFileBody,
    rawFormula: null,
    rawAnswer: "The raw model answers from general Excel knowledge without the bundled excel.md artifact pack.",
    usageCount: excelArtifactCases.reduce((total, artifactCase) => total + artifactCase.usageCount, 0),
    benchmarkScore:
      excelArtifactCases.reduce((total, artifactCase) => total + artifactCase.benchmarkScore, 0) /
      excelArtifactCases.length,
    storageUri: "artifact://marketplace/excel.md"
  }),
  createMarketplaceArtifact({
    id: "sui",
    title: "Sui docs artifact pack",
    domain: "sui",
    difficulty: "medium",
    tags: ["sui", "docs", "ai agents", "walrus", ...suiTags].slice(0, 18),
    questionPattern: suiArtifactCases.map((artifactCase) => artifactCase.questionPattern).join("\n"),
    formulaPattern: "",
    concepts: suiConcepts,
    answer: suiFileBody,
    rawFormula: null,
    rawAnswer: "The raw model answers from general Sui knowledge without the curated Sui docs artifact pack.",
    usageCount: suiArtifactCases.reduce((total, artifactCase) => total + artifactCase.usageCount, 0),
    benchmarkScore:
      suiArtifactCases.reduce((total, artifactCase) => total + artifactCase.benchmarkScore, 0) /
      suiArtifactCases.length,
    storageUri: "artifact://marketplace/sui.md"
  })
];

function createMarketplaceArtifact(
  artifact: Omit<
    AgentArtifactResource,
    "source" | "creator" | "version" | "createdAt" | "updatedAt" | "storage"
  > & { domain: AgentArtifactDomain; storageUri: string }
): AgentArtifactResource {
  const { storageUri, ...artifactContent } = artifact;
  const contentHash = hashArtifactContent(artifactContent);

  return {
    ...artifactContent,
    source: "marketplace",
    creator: "DataLoop",
    version: "1.0.0",
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
    storage: {
      ...buildPreparedStorageProof(artifact.id, contentHash),
      uri: storageUri
    }
  };
}

function buildExcelArtifactFileBody(artifactCases: ExcelArtifactCase[]) {
  return [
    "# Excel Artifact Pack",
    "",
    "A single DataLoop artifact file containing reusable Excel question patterns, formulas, concepts, and answer guidance.",
    "",
    "## Questions",
    "",
    artifactCases.map(renderExcelArtifactCase).join("\n\n")
  ].join("\n");
}

function renderExcelArtifactCase(artifactCase: ExcelArtifactCase, index: number) {
  return [
    `### ${index + 1}. ${artifactCase.title}`,
    "",
    `Question: ${artifactCase.questionPattern}`,
    "",
    "Formula:",
    "```excel",
    artifactCase.formulaPattern || "No formula pattern",
    "```",
    "",
    `Concepts: ${artifactCase.concepts.join(", ")}`,
    "",
    `Answer: ${artifactCase.answer}`,
    "",
    `Raw baseline: ${artifactCase.rawAnswer}`
  ].join("\n");
}

function buildSuiArtifactFileBody(artifactCases: SuiArtifactCase[]) {
  return [
    "# Sui Docs Artifact Pack",
    "",
    "A DataLoop artifact file containing Sui and Walrus documentation Q&A for the agent benchmark.",
    "",
    "## Questions",
    "",
    artifactCases.map(renderSuiArtifactCase).join("\n\n")
  ].join("\n");
}

function renderSuiArtifactCase(artifactCase: SuiArtifactCase, index: number) {
  return [
    `### ${index + 1}. ${artifactCase.title}`,
    "",
    `Question: ${artifactCase.questionPattern}`,
    "",
    `Concepts: ${artifactCase.concepts.join(", ")}`,
    "",
    `Answer: ${artifactCase.answer}`,
    "",
    `Raw baseline: ${artifactCase.rawAnswer}`
  ].join("\n");
}

function unique(values: string[]) {
  return [...new Set(values)];
}
