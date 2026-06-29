import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Archive, ChevronLeft, FileText, Menu, Plus, User, X } from "lucide-react";
import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";

import { Panel } from "../components/Panel";
import { StatusNotice } from "../components/StatusNotice";
import { WalletConnectButton } from "../components/WalletConnectButton";
import {
  ApiClientError,
  addAgentArtifactToLibrary,
  compareAgentQuestion,
  getAgentLibrary,
  getAgentMarketplaceArtifacts,
  listPlatformAgents,
  listPlatformArtifacts,
  removeAgentArtifactFromLibrary,
  updatePlatformAgent,
  uploadAgentArtifact,
  type AgentAnswerResource,
  type AgentArtifactResource,
  type AgentArtifactStorageProof,
  type AgentComparisonResult,
  type AgentProviderStatus,
  type PlatformAgent,
  type PlatformArtifact
} from "../lib/api";
import { sha256Bytes, useCreateArtifact } from "../lib/sui/artifacts";
import type { SuiNetwork } from "../lib/sui/network-config";

interface NoticeState {
  tone: "neutral" | "success" | "error";
  message: string;
}

type WorkspaceKey = "agent" | "artifacts";
type ArtifactSectionKey = "marketplace" | "library" | "upload";
type AgentAnswerMode = "raw" | "artifact";

interface DemoArtifact {
  id: string;
  suiObjectId?: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  questionPattern: string;
  formulaPattern: string;
  concepts: string[];
  answer: string;
  rawFormula?: string;
  rawAnswer: string;
  source: "marketplace" | "upload";
  creator?: string;
  version?: string;
  usageCount?: number;
  benchmarkScore?: number | null;
  storage?: AgentArtifactStorageProof;
}

interface ArtifactCase {
  id: string;
  title: string;
  difficulty: DemoArtifact["difficulty"];
  tags: string[];
  questionPattern: string;
  formulaPattern: string;
  concepts: string[];
  answer: string;
  rawFormula?: string;
  rawAnswer: string;
  usageCount: number;
  benchmarkScore: number;
}

interface AgentAnswer {
  label: string;
  formula: string;
  explanation: string;
  confidence: number;
  artifactIds: string[];
  matchedArtifactTitle: string;
  provider?: AgentProviderStatus;
}

interface AgentComparison {
  raw: AgentAnswer;
  augmented: AgentAnswer;
  retrievedArtifacts?: DemoArtifact[];
  runId?: string;
}

interface AgentChatTurn {
  id: string;
  question: string;
  answerMode: AgentAnswerMode;
  comparison: AgentComparison;
  createdAt: string;
}

interface UploadArtifactFormState {
  title: string;
  questionPattern: string;
  formulaPattern: string;
  concepts: string;
  answer: string;
}

interface DashboardPageProps {
  onBackToIntro: () => void;
}

const AGENT_LIBRARY_KEY = "dataloop.agent.artifactLibrary";
const AGENT_UPLOADS_KEY = "dataloop.agent.uploadedArtifacts";
const DEFAULT_AGENT_ARTIFACT_ID = "excel";
const SUI_AGENT_ARTIFACT_ID = "sui";
const DEFAULT_AGENT_QUESTION =
  "In a sales table with dates in A, regions in B, amounts in C, what formula sums sales in 'North' region after 2024-01-01?";
const DEFAULT_SUI_AGENT_QUESTION = "What is Sui and what are the core components of its stack?";

const EXCEL_ARTIFACT_CASES: ArtifactCase[] = [
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

const SUI_ARTIFACT_CASES: ArtifactCase[] = [
  {
    id: "sui-stack-overview",
    title: "Sui stack overview",
    difficulty: "easy",
    tags: ["sui", "move", "objects", "ai agents", "layer 1"],
    questionPattern: DEFAULT_SUI_AGENT_QUESTION,
    formulaPattern: "",
    concepts: ["Sui", "Move", "object-centric data model", "programmable transaction blocks", "Walrus Storage"],
    answer:
      "Sui is a Layer 1 smart-contract platform built around the Move language and an object-centric data model. Applications compose owned and shared objects through programmable transaction blocks, while Walrus provides decentralized blob storage coordinated through Sui.\n\nSources: https://docs.sui.io/concepts/object-model and https://docs.wal.app/",
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
    rawAnswer:
      "Sui transactions can contain multiple operations. A generic answer may omit atomic composition, shared results, and object inputs.",
    usageCount: 247,
    benchmarkScore: 0.91
  }
];

const SUGGESTED_AGENT_CASES = [
  ...EXCEL_ARTIFACT_CASES.slice(0, 2),
  ...SUI_ARTIFACT_CASES.slice(0, 2)
];

const MARKETPLACE_ARTIFACTS: DemoArtifact[] = [
  {
    id: "excel",
    title: "Excel artifact pack",
    difficulty: "medium",
    tags: ["excel", "formula library", ...uniqueStrings(EXCEL_ARTIFACT_CASES.flatMap((artifactCase) => artifactCase.tags))],
    questionPattern: EXCEL_ARTIFACT_CASES.map((artifactCase) => artifactCase.questionPattern).join("\n"),
    formulaPattern: "See excel.md",
    concepts: uniqueStrings(EXCEL_ARTIFACT_CASES.flatMap((artifactCase) => artifactCase.concepts)),
    answer: buildExcelArtifactFileBody(),
    rawAnswer: "The raw model answers from general Excel knowledge without the bundled excel.md artifact pack.",
    source: "marketplace",
    creator: "Neura",
    version: "1.0.0",
    usageCount: EXCEL_ARTIFACT_CASES.reduce((total, artifactCase) => total + artifactCase.usageCount, 0),
    benchmarkScore:
      EXCEL_ARTIFACT_CASES.reduce((total, artifactCase) => total + artifactCase.benchmarkScore, 0) /
      EXCEL_ARTIFACT_CASES.length
  },
  {
    id: SUI_AGENT_ARTIFACT_ID,
    title: "Sui docs artifact pack",
    difficulty: "medium",
    tags: ["sui", "docs", "ai agents", "walrus", ...uniqueStrings(SUI_ARTIFACT_CASES.flatMap((artifactCase) => artifactCase.tags))],
    questionPattern: SUI_ARTIFACT_CASES.map((artifactCase) => artifactCase.questionPattern).join("\n"),
    formulaPattern: "",
    concepts: uniqueStrings(SUI_ARTIFACT_CASES.flatMap((artifactCase) => artifactCase.concepts)),
    answer: buildSuiArtifactFileBody(),
    rawAnswer: "The raw model answers from general Sui knowledge without the curated Sui docs artifact pack.",
    source: "marketplace",
    creator: "Neura",
    version: "1.0.0",
    usageCount: SUI_ARTIFACT_CASES.reduce((total, artifactCase) => total + artifactCase.usageCount, 0),
    benchmarkScore:
      SUI_ARTIFACT_CASES.reduce((total, artifactCase) => total + artifactCase.benchmarkScore, 0) /
      SUI_ARTIFACT_CASES.length
  }
];

export function DashboardPage({ onBackToIntro }: DashboardPageProps) {
  const walletAccount = useCurrentAccount();
  const { network, selectNetwork } = useSuiClientContext();
  const { createArtifact, isConfigured: isArtifactPublishingConfigured, isPending: isPublishingArtifact } =
    useCreateArtifact();
  const [walletNotice, setWalletNotice] = useState<NoticeState | null>(null);

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>("agent");
  const [activeArtifactSection, setActiveArtifactSection] = useState<ArtifactSectionKey>("marketplace");
  const [agentAnswerMode, setAgentAnswerMode] = useState<AgentAnswerMode>("artifact");
  const [agentQuestion, setAgentQuestion] = useState(DEFAULT_AGENT_QUESTION);
  const [agentNotice, setAgentNotice] = useState<NoticeState | null>(null);
  const [marketplaceArtifacts, setMarketplaceArtifacts] = useState<DemoArtifact[]>(MARKETPLACE_ARTIFACTS);
  const [selectedMarketplaceArtifactId, setSelectedMarketplaceArtifactId] = useState(DEFAULT_AGENT_ARTIFACT_ID);
  const [libraryIds, setLibraryIds] = useState<string[]>(() => normalizeLibraryIds(readStoredIds(AGENT_LIBRARY_KEY)));
  const [uploadedArtifacts, setUploadedArtifacts] = useState<DemoArtifact[]>(readStoredArtifacts);
  const [groundingArtifacts, setGroundingArtifacts] = useState<PlatformArtifact[]>([]);
  const [platformAgents, setPlatformAgents] = useState<PlatformAgent[]>([]);
  const [selectedGroundingAgentId, setSelectedGroundingAgentId] = useState("");
  const [agentChatHistory, setAgentChatHistory] = useState<AgentChatTurn[]>([]);
  const [lastAgentArtifactSelection, setLastAgentArtifactSelection] = useState<string[]>([]);
  const [uploadArtifactForm, setUploadArtifactForm] = useState<UploadArtifactFormState>(() =>
    createEmptyUploadArtifactForm()
  );
  const [isLoadingAgentWorkspace, setIsLoadingAgentWorkspace] = useState(false);
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [isUploadingAgentArtifact, setIsUploadingAgentArtifact] = useState(false);

  useEffect(() => {
    writeStoredIds(AGENT_LIBRARY_KEY, libraryIds);
  }, [libraryIds]);

  useEffect(() => {
    writeStoredArtifacts(uploadedArtifacts);
  }, [uploadedArtifacts]);

  useEffect(() => {
    let isMounted = true;

    async function loadAgentWorkspace() {
      setIsLoadingAgentWorkspace(true);

      try {
        const [marketplaceResult, libraryResult, persistentArtifacts, persistentAgents] = await Promise.all([
          getAgentMarketplaceArtifacts(),
          getAgentLibrary(),
          listPlatformArtifacts(),
          listPlatformAgents()
        ]);

        if (!isMounted) {
          return;
        }

        const nextMarketplaceArtifacts = marketplaceResult.artifacts.map(toDemoArtifact);
        const nextLibraryArtifacts = libraryResult.artifacts.map(toDemoArtifact);
        const nextUploadedArtifacts = nextLibraryArtifacts.filter((artifact) => artifact.source === "upload");

        setMarketplaceArtifacts(nextMarketplaceArtifacts.length > 0 ? nextMarketplaceArtifacts : MARKETPLACE_ARTIFACTS);
        setUploadedArtifacts((current) =>
          mergeDemoArtifacts(nextUploadedArtifacts, current).filter((artifact) => artifact.source === "upload")
        );
        setLibraryIds(normalizeLibraryIds(nextLibraryArtifacts.map((artifact) => artifact.id)));
        setGroundingArtifacts(persistentArtifacts);
        setPlatformAgents(persistentAgents);
        setSelectedGroundingAgentId((current) => current || persistentAgents[0]?.id || "");
      } catch (error) {
        if (isMounted) {
          setAgentNotice({
            tone: "neutral",
            message: `Agent API unavailable; using local demo state. ${formatError(error)}`
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingAgentWorkspace(false);
        }
      }
    }

    void loadAgentWorkspace();

    return () => {
      isMounted = false;
    };
  }, []);

  const hasWalletConnection = walletAccount !== null;
  const connectedStateLabel = hasWalletConnection ? shortId(walletAccount.address) : "Not connected";
  const networkLabel = network === "mainnet" ? "Sui Mainnet" : "Sui Testnet";
  const allArtifacts = useMemo(
    () => mergeDemoArtifacts(marketplaceArtifacts, uploadedArtifacts),
    [marketplaceArtifacts, uploadedArtifacts]
  );
  const libraryArtifacts = useMemo(
    () =>
      libraryIds
        .map((artifactId) => allArtifacts.find((artifact) => artifact.id === artifactId))
        .filter((artifact): artifact is DemoArtifact => artifact !== undefined),
    [libraryIds, allArtifacts]
  );
  const selectedArtifactLabel =
    libraryArtifacts.length === 1
      ? libraryArtifacts[0]?.title ?? "Selected artifact"
      : `${libraryArtifacts[0]?.title ?? "Selected artifact"} +${libraryArtifacts.length - 1}`;
  const selectedMarketplaceArtifact =
    marketplaceArtifacts.find((artifact) => artifact.id === selectedMarketplaceArtifactId) ?? marketplaceArtifacts[0] ?? null;
  const workspaceTitle = activeWorkspace === "agent" ? "Agent" : "Artifacts";
  const workspaceCopy =
    activeWorkspace === "agent"
      ? "Ask a question and compare raw model output with artifact-grounded output."
      : "Install, inspect, upload, and manage artifact files that agents can reuse directly.";

  function handleSelectNetwork(nextNetwork: SuiNetwork) {
    selectNetwork(nextNetwork);
    setWalletNotice({
      tone: "success",
      message: `Using ${nextNetwork === "mainnet" ? "Sui Mainnet" : "Sui Testnet"}.`
    });
  }

  function handleWorkspaceChange(workspace: WorkspaceKey) {
    setActiveWorkspace(workspace);
  }

  async function assignGroundingArtifact(artifact: PlatformArtifact) {
    const agent = platformAgents.find((candidate) => candidate.id === selectedGroundingAgentId);
    if (!agent) {
      setAgentNotice({ tone: "error", message: "Select an agent before using this artifact." });
      return;
    }
    const artifactIds = [...new Set([...(agent.artifacts ?? []).map((item) => item.artifactId), artifact.id])];
    try {
      const updated = await updatePlatformAgent(agent.id, { artifactIds });
      setPlatformAgents((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setAgentNotice({ tone: "success", message: `${artifact.title} is assigned to ${agent.name}.` });
    } catch (error) {
      setAgentNotice({ tone: "error", message: formatError(error) });
    }
  }

  function downloadGroundingArtifact(artifact: PlatformArtifact) {
    const version = artifact.versions[0];
    if (!version) return;
    const fileName = typeof version.metadata?.fileName === "string" ? version.metadata.fileName : `${artifact.domain}.md`;
    const url = URL.createObjectURL(new Blob([version.content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function addArtifactToLibrary(artifactId: string) {
    setLibraryIds((current) =>
      current.includes(artifactId) ? current : normalizeLibraryIds([artifactId, ...current].slice(0, 12))
    );

    try {
      const result = await addAgentArtifactToLibrary(artifactId);
      const nextLibraryArtifacts = result.library.map(toDemoArtifact);
      const nextUploadedArtifacts = nextLibraryArtifacts.filter((artifact) => artifact.source === "upload");

      setLibraryIds(normalizeLibraryIds(nextLibraryArtifacts.map((artifact) => artifact.id)));
      setUploadedArtifacts((current) =>
        mergeDemoArtifacts(nextUploadedArtifacts, current).filter((artifact) => artifact.source === "upload")
      );
      setAgentNotice({
        tone: "success",
        message: "Artifact added to library."
      });
    } catch (error) {
      setAgentNotice({
        tone: "success",
        message: `Artifact added locally. Backend sync unavailable: ${formatError(error)}`
      });
    }
  }

  async function removeArtifactFromLibrary(artifactId: string) {
    setLibraryIds((current) => current.filter((candidate) => candidate !== artifactId));

    try {
      const result = await removeAgentArtifactFromLibrary(artifactId);
      setLibraryIds(result.library.map((artifact) => artifact.id));
      setAgentNotice({
        tone: "neutral",
        message: "Artifact removed from library."
      });
    } catch (error) {
      setAgentNotice({
        tone: "neutral",
        message: `Artifact removed locally. Backend sync unavailable: ${formatError(error)}`
      });
    }
  }

  async function clearAgentArtifactSelection() {
    if (libraryIds.length === 0) {
      return;
    }

    const selectedArtifactIds = [...libraryIds];
    setLastAgentArtifactSelection(selectedArtifactIds);
    setLibraryIds([]);
    setAgentNotice({
      tone: "neutral",
      message: "Artifact selection cleared."
    });

    try {
      await Promise.all(selectedArtifactIds.map((artifactId) => removeAgentArtifactFromLibrary(artifactId)));
    } catch (error) {
      setAgentNotice({
        tone: "neutral",
        message: `Artifact selection cleared locally. Backend sync unavailable: ${formatError(error)}`
      });
    }
  }

  function openArtifactSelection() {
    setActiveWorkspace("artifacts");
    setActiveArtifactSection("marketplace");
  }

  function selectRawAgentMode() {
    setAgentAnswerMode("raw");
    if (libraryIds.length > 0) {
      setLastAgentArtifactSelection(libraryIds);
      setLibraryIds([]);
      setAgentNotice({
        tone: "neutral",
        message: "Raw mode selected. Artifact context removed for new answers."
      });
    }
  }

  function selectArtifactAgentMode() {
    setAgentAnswerMode("artifact");

    if (libraryIds.length > 0) {
      return;
    }

    const artifactIdsToRestore = lastAgentArtifactSelection.length > 0 ? lastAgentArtifactSelection : [DEFAULT_AGENT_ARTIFACT_ID];
    const normalizedArtifactIds = normalizeLibraryIds(artifactIdsToRestore);
    setLibraryIds(normalizedArtifactIds);
    void addArtifactToLibrary(normalizedArtifactIds[0] ?? DEFAULT_AGENT_ARTIFACT_ID);
  }

  function useArtifactWithAgent(artifact: DemoArtifact) {
    setAgentQuestion(getDefaultQuestionForArtifact(artifact));
    setActiveWorkspace("agent");
    setAgentAnswerMode("artifact");
    void addArtifactToLibrary(artifact.id);
  }

  async function handleAgentQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasWalletConnection) {
      setWalletNotice({ tone: "neutral", message: "Connect Wallet to Start" });
      return;
    }

    const trimmedQuestion = agentQuestion.trim();

    if (trimmedQuestion.length === 0) {
      setAgentNotice({ tone: "error", message: "Enter a question before running the agent." });
      return;
    }

    const answerMode = agentAnswerMode;
    const turnId = createAgentChatTurnId();
    const optimisticComparison = buildAgentComparison(trimmedQuestion, libraryArtifacts, marketplaceArtifacts);

    setAgentChatHistory((current) => [
      ...current,
      {
        id: turnId,
        question: trimmedQuestion,
        answerMode,
        comparison: optimisticComparison,
        createdAt: new Date().toISOString()
      }
    ]);
    setIsRunningAgent(true);
    setAgentQuestion("");
    setAgentNotice({ tone: "neutral", message: "Running raw and artifact-backed paths through the backend..." });

    try {
      const result = await compareAgentQuestion(trimmedQuestion);
      const comparison = toDemoComparison(result);
      setAgentChatHistory((current) =>
        current.map((turn) => (turn.id === turnId ? { ...turn, comparison } : turn))
      );
      setAgentNotice(
        result.retrievedArtifacts.length > 0
          ? { tone: "success", message: `Artifact context loaded: ${result.retrievedArtifacts[0]?.title ?? "library artifact"}.` }
          : { tone: "neutral", message: "Raw answer is available. Add a matching artifact for the augmented path." }
      );
    } catch (error) {
      const matchedArtifact = findBestArtifact(trimmedQuestion, libraryArtifacts);
      setAgentNotice(
        matchedArtifact
          ? {
              tone: "success",
              message: `Using local artifact fallback: ${matchedArtifact.title}. Backend sync unavailable: ${formatError(error)}`
            }
          : {
              tone: "neutral",
              message: `Using local raw fallback. Add a matching artifact for the augmented path. ${formatError(error)}`
            }
      );
    } finally {
      setIsRunningAgent(false);
    }
  }

  async function handleArtifactFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    const text = await file.text();
    setUploadArtifactForm((current) => ({
      ...current,
      title: current.title || file.name.replace(/\.[^.]+$/, ""),
      answer: current.answer || text.slice(0, 900)
    }));
  }

  async function handleUploadArtifact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = uploadArtifactForm.title.trim();
    const answer = uploadArtifactForm.answer.trim();

    if (title.length === 0 || answer.length === 0) {
      setAgentNotice({ tone: "error", message: "Uploaded artifacts need a title and answer." });
      return;
    }

    setIsUploadingAgentArtifact(true);
    let artifact: DemoArtifact;
    let backendLibraryArtifacts: DemoArtifact[] = [];
    let backendLibraryIds: string[] | null = null;
    let usedLocalFallback = false;

    try {
      const result = await uploadAgentArtifact({
        title,
        ...optionalField("questionPattern", uploadArtifactForm.questionPattern),
        ...optionalField("formulaPattern", uploadArtifactForm.formulaPattern),
        concepts: splitCsv(uploadArtifactForm.concepts),
        answer
      });
      artifact = toDemoArtifact(result.artifact);
      const nextLibraryArtifacts = result.library.map(toDemoArtifact);
      backendLibraryArtifacts = nextLibraryArtifacts.filter((candidate) => candidate.source === "upload");
      backendLibraryIds = nextLibraryArtifacts.map((candidate) => candidate.id);
    } catch (error) {
      usedLocalFallback = true;
      artifact = {
        id: `upload-${crypto.randomUUID()}`,
        title,
        difficulty: "medium",
        tags: splitCsv(uploadArtifactForm.concepts).slice(0, 6),
        questionPattern: uploadArtifactForm.questionPattern.trim() || title,
        formulaPattern: uploadArtifactForm.formulaPattern.trim(),
        concepts: splitCsv(uploadArtifactForm.concepts),
        answer,
        rawAnswer: "The raw model does not have this uploaded artifact in context.",
        source: "upload"
      };
      setAgentNotice({ tone: "neutral", message: `Using local upload fallback. ${formatError(error)}` });
    }

    let publishNotice: NoticeState;

    if (!hasWalletConnection) {
      publishNotice = {
        tone: "neutral",
        message: `${usedLocalFallback ? "Artifact saved locally." : "Artifact added to the library."} Connect Slush to publish it on Sui.`
      };
    } else if (!isArtifactPublishingConfigured) {
      publishNotice = {
        tone: "error",
        message: "Artifact saved, but Sui publication requires package and ArtifactRegistry object IDs."
      };
    } else {
      try {
        const metadata = JSON.stringify({
          id: artifact.id,
          title: artifact.title,
          questionPattern: artifact.questionPattern,
          formulaPattern: artifact.formulaPattern,
          concepts: artifact.concepts,
          answer: artifact.answer
        });
        const metadataUri = `neura://artifact/${encodeURIComponent(artifact.id)}/metadata`;
        const storageUri = artifact.storage?.uri ?? `neura://artifact/${encodeURIComponent(artifact.id)}`;
        const [metadataHash, storageHash] = await Promise.all([
          sha256Bytes(metadata),
          sha256Bytes(artifact.storage?.contentHash ?? storageUri)
        ]);
        const suiObjectId = await createArtifact({ metadataUri, metadataHash, storageUri, storageHash });
        artifact = { ...artifact, suiObjectId };
        publishNotice = {
          tone: "success",
          message: `Artifact published on ${networkLabel} as ${shortId(suiObjectId)}.`
        };
      } catch (error) {
        publishNotice = {
          tone: "error",
          message: `Artifact saved, but Sui publication failed. ${formatError(error)}`
        };
      }
    }

    setUploadedArtifacts((current) =>
      mergeDemoArtifacts([artifact, ...backendLibraryArtifacts], current)
        .filter((candidate) => candidate.source === "upload")
        .slice(0, 12)
    );
    setLibraryIds((current) =>
      backendLibraryIds ?? [artifact.id, ...current.filter((candidate) => candidate !== artifact.id)].slice(0, 12)
    );
    setSelectedMarketplaceArtifactId(DEFAULT_AGENT_ARTIFACT_ID);
    setUploadArtifactForm(createEmptyUploadArtifactForm());
    setAgentQuestion(artifact.questionPattern);
    setAgentAnswerMode("artifact");
    setActiveArtifactSection("library");
    setActiveWorkspace("artifacts");
    setAgentNotice(publishNotice);
    setIsUploadingAgentArtifact(false);
  }

  const artifactSectionItems = [
    { key: "marketplace" as const, label: "Marketplace" },
    { key: "library" as const, label: "Library" },
    { key: "upload" as const, label: "Upload" }
  ];

  const artifactWorkspacePanel =
    activeArtifactSection === "library" ? (
      <Panel
        title="Artifact Library"
        eyebrow="Installed Files"
        action={
          <button type="button" className="button button-secondary" onClick={() => setActiveArtifactSection("marketplace")}>
            Browse Marketplace
          </button>
        }
      >
        {agentNotice ? <StatusNotice tone={agentNotice.tone} message={agentNotice.message} /> : null}
        {libraryArtifacts.length === 0 && groundingArtifacts.length === 0 ? (
          <EmptyState message="No artifact files are available in this library." />
        ) : (
          <div className="stack">
            {libraryArtifacts.length > 0 ? <div className="artifact-library-grid">
              {libraryArtifacts.map((artifact) => (
              <div className="record-card artifact-library-card" key={artifact.id}>
                <RecordHeader title={artifactFileName(artifact)} subtitle={artifact.title} />
                <ArtifactDetail artifact={artifact} compact />
                <div className="inline-actions">
                  <button type="button" className="button button-primary" onClick={() => useArtifactWithAgent(artifact)}>
                    Use with Agent
                  </button>
                  <button type="button" className="button button-tertiary" onClick={() => void removeArtifactFromLibrary(artifact.id)}>
                    Remove
                  </button>
                </div>
              </div>
              ))}
            </div> : null}
            {groundingArtifacts.length > 0 ? (
              <section className="stack">
                <div>
                  <span className="micro-label">Persistent grounding catalog</span>
                  <h3>Agent knowledge artifacts</h3>
                  <p className="section-copy">Assigned workspace drafts can ground your private agents immediately. Sui publication records the approved public version.</p>
                </div>
                {platformAgents.length > 0 ? (
                  <Field label="Target agent" helper="Choose where Use Artifact should attach the grounding pack.">
                    <select value={selectedGroundingAgentId} onChange={(event) => setSelectedGroundingAgentId(event.target.value)}>
                      {platformAgents.filter((agent) => agent.status !== "ARCHIVED").map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}
                    </select>
                  </Field>
                ) : null}
                <div className="artifact-library-grid">
                  {groundingArtifacts.filter((artifact) => artifact.versions[0]?.status !== "ARCHIVED").map((artifact) => {
                    const version = artifact.versions[0];
                    const selectedAgent = platformAgents.find((agent) => agent.id === selectedGroundingAgentId);
                    const isAssigned = selectedAgent?.artifacts?.some((item) => item.artifactId === artifact.id) ?? false;
                    return (
                      <article className="record-card artifact-library-card" key={artifact.id}>
                        <RecordHeader title={persistentArtifactFileName(artifact)} subtitle={artifact.title} />
                        <PersistentArtifactDetail artifact={artifact} compact />
                        <div className="inline-actions">
                          <button type="button" className="button button-primary" onClick={() => void assignGroundingArtifact(artifact)} disabled={!selectedGroundingAgentId || isAssigned}>
                            {isAssigned ? `Assigned to ${selectedAgent?.name ?? "Agent"}` : "Use with Agent"}
                          </button>
                          <button type="button" className="button button-tertiary" onClick={() => downloadGroundingArtifact(artifact)}>
                            Download .md
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Panel>
    ) : activeArtifactSection === "upload" ? (
      <Panel title="Upload Artifact" eyebrow="Library">
        {agentNotice ? <StatusNotice tone={agentNotice.tone} message={agentNotice.message} /> : null}
        <form className="stack" onSubmit={handleUploadArtifact}>
          <Field label="Artifact File">
            <input type="file" accept=".md,.txt,.json" onChange={(event) => void handleArtifactFileUpload(event)} />
          </Field>
          <Field label="Title">
            <input
              value={uploadArtifactForm.title}
              onChange={(event) => setUploadArtifactForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Custom Excel artifact"
            />
          </Field>
          <Field label="Question Pattern">
            <textarea
              value={uploadArtifactForm.questionPattern}
              onChange={(event) =>
                setUploadArtifactForm((current) => ({ ...current, questionPattern: event.target.value }))
              }
              placeholder="Question this artifact should match"
            />
          </Field>
          <Field label="Formula Pattern">
            <input
              value={uploadArtifactForm.formulaPattern}
              onChange={(event) =>
                setUploadArtifactForm((current) => ({ ...current, formulaPattern: event.target.value }))
              }
              placeholder="=FORMULA(...)"
            />
          </Field>
          <Field label="Concepts">
            <input
              value={uploadArtifactForm.concepts}
              onChange={(event) => setUploadArtifactForm((current) => ({ ...current, concepts: event.target.value }))}
              placeholder="SUMIFS, date criteria"
            />
          </Field>
          <Field label="Answer">
            <textarea
              value={uploadArtifactForm.answer}
              onChange={(event) => setUploadArtifactForm((current) => ({ ...current, answer: event.target.value }))}
              placeholder="Artifact-backed answer"
            />
          </Field>
          <button className="button button-primary" type="submit" disabled={isUploadingAgentArtifact || isPublishingArtifact}>
            {isPublishingArtifact ? "Publishing on Sui..." : isUploadingAgentArtifact ? "Adding..." : "Add to Library"}
          </button>
        </form>
      </Panel>
    ) : (
      <div className="agent-grid">
        <Panel
          title="Artifact Marketplace"
          eyebrow="Browse"
          action={
            selectedMarketplaceArtifact ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void addArtifactToLibrary(selectedMarketplaceArtifact.id)}
              >
                Add Selected
              </button>
            ) : null
          }
        >
          {agentNotice ? <StatusNotice tone={agentNotice.tone} message={agentNotice.message} /> : null}
          {isLoadingAgentWorkspace ? <LoadingState message="Loading artifact files..." /> : null}
          <div className="artifact-list">
            {marketplaceArtifacts.map((artifact) => {
              const inLibrary = libraryIds.includes(artifact.id);
              return (
                <button
                  className={`artifact-card ${selectedMarketplaceArtifactId === artifact.id ? "artifact-card-active" : ""}`}
                  key={artifact.id}
                  type="button"
                  onClick={() => setSelectedMarketplaceArtifactId(artifact.id)}
                >
                  <span className="artifact-card-topline">
                    <span className="label">Artifact file</span>
                    <span className={`library-badge ${inLibrary ? "library-badge-on" : ""}`}>
                      {inLibrary ? "In Library" : "Marketplace"}
                    </span>
                  </span>
                  <strong className="mono-text">{artifactFileName(artifact)}</strong>
                  <span className="helper-copy">{artifact.title}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title={selectedMarketplaceArtifact ? artifactFileName(selectedMarketplaceArtifact) : "Artifact File"}
          eyebrow="Selection"
          action={
            selectedMarketplaceArtifact ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => useArtifactWithAgent(selectedMarketplaceArtifact)}
              >
                Use with Agent
              </button>
            ) : null
          }
        >
          {selectedMarketplaceArtifact ? (
            <ArtifactDetail artifact={selectedMarketplaceArtifact} />
          ) : (
            <EmptyState message="Select an artifact file to inspect it." />
          )}
        </Panel>
      </div>
    );

  const agentWorkspacePanel = (
    <div className="agent-grid">
      <section className="panel agent-chat-panel">
        <div className="agent-chat-heading">
          <div>
            <h2>Ask the Agent</h2>
          </div>
        </div>

        {agentChatHistory.length > 0 ? (
          <div className="agent-chat-history">
            {agentChatHistory.map((turn) => (
              <AgentChatTranscript
                answer={turn.answerMode === "artifact" ? turn.comparison.augmented : turn.comparison.raw}
                key={turn.id}
                question={turn.question}
              />
            ))}
          </div>
        ) : null}

        <form className="agent-zap-composer" onSubmit={handleAgentQuestionSubmit}>
          {libraryArtifacts.length > 0 ? (
            <div className="agent-composer-topline">
              <div className="agent-composer-artifacts">
                <span className="library-badge library-badge-on agent-composer-badge">{selectedArtifactLabel}</span>
                <button
                  type="button"
                  className="agent-artifact-clear-button"
                  onClick={() => {
                    void clearAgentArtifactSelection();
                  }}
                  aria-label="Remove artifact from selection"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : null}
          <textarea
            value={agentQuestion}
            onChange={(event) => setAgentQuestion(event.target.value)}
            placeholder="Ask how to solve an Excel formula problem..."
          />
          <div className="agent-composer-footer">
            <div className="agent-option-bar" role="tablist" aria-label="Answer mode">
              <button
                type="button"
                className={agentAnswerMode === "raw" ? "zap-mode-active" : ""}
                onClick={selectRawAgentMode}
              >
                Raw LLM
              </button>
              <button
                type="button"
                className={agentAnswerMode === "artifact" ? "zap-mode-active" : ""}
                onClick={selectArtifactAgentMode}
              >
                With Artifacts
              </button>
              <button
                type="button"
                className="agent-artifact-add-button"
                onClick={openArtifactSelection}
                aria-label="Select artifact"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="agent-run-actions">
              <button
                className="zap-send-button"
                type="submit"
                disabled={!hasWalletConnection || isRunningAgent}
                title={!hasWalletConnection ? "Connect your wallet to send a question" : undefined}
              >
                <span>{isRunningAgent ? "Running..." : "Send"}</span>
              </button>
            </div>
          </div>
        </form>

        <div className="quick-question-grid quick-question-shelf" aria-label="Suggested agent questions">
          {SUGGESTED_AGENT_CASES.map((artifactCase) => (
            <button
              className="quick-question-chip"
              key={artifactCase.id}
              type="button"
              onClick={() => {
                setAgentQuestion(artifactCase.questionPattern);
              }}
            >
              {artifactCase.title}
            </button>
          ))}
        </div>

        {agentNotice ? (
          <div className={`zap-status-pill zap-status-${agentNotice.tone}`} role="status">
            <span aria-hidden="true" />
            <p>{agentNotice.message}</p>
          </div>
        ) : null}
      </section>
    </div>
  );

  return (
    <>
      <header className={`topbar ${activeWorkspace === "agent" ? "agent-page-topbar" : "artifact-page-topbar"}`}>
        <div className="topbar-inner">
          <div className="topbar-brand-area">
            <button className="back-button back-icon-button" type="button" onClick={onBackToIntro} aria-label="Back to introductory pages">
              <span aria-hidden="true">&lt;</span>
            </button>

            <WorkspaceToggle activeWorkspace={activeWorkspace} onChange={handleWorkspaceChange} />

            <div className="brand-lockup">
              <strong className="app-wordmark">Neura</strong>
            </div>
          </div>

          <div aria-hidden="true" />

          <div className="topbar-meta">
            <div className="network-select">
              <button
                className={`network-pill network-select-trigger ${hasWalletConnection ? "network-pill-live" : ""}`}
                type="button"
                aria-haspopup="menu"
              >
                <div>
                  <span className="micro-label">Network</span>
                  <strong>{networkLabel}</strong>
                </div>
              </button>

              <div className="network-menu" role="menu">
                <button
                  className={`network-menu-item ${network === "testnet" ? "network-menu-item-active" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNetwork("testnet")}
                >
                  <span className="network-option-index">1</span>
                  <span>
                    <strong>Sui Testnet</strong>
                    <small>{network === "testnet" ? "Selected" : "Select network"}</small>
                  </span>
                </button>
                <button
                  className={`network-menu-item ${network === "mainnet" ? "network-menu-item-active" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelectNetwork("mainnet")}
                >
                  <span className="network-option-index">2</span>
                  <span>
                    <strong>Sui Mainnet</strong>
                    <small>{network === "mainnet" ? "Selected" : "Select network"}</small>
                  </span>
                </button>
              </div>
            </div>

            <span className="wallet-address-pill">{connectedStateLabel}</span>

            {walletNotice ? (
              <span className={`topbar-notice topbar-notice-${walletNotice.tone}`}>{walletNotice.message}</span>
            ) : activeWorkspace === "agent" && !hasWalletConnection ? (
              <span className="topbar-notice topbar-notice-neutral">Connect Wallet to Start</span>
            ) : null}

            <WalletConnectButton onNotice={setWalletNotice} />
          </div>
        </div>
      </header>

      <main className={`app-shell ${activeWorkspace === "agent" ? "agent-page-shell" : "artifact-page-shell"}`}>
        <section className="workspace-shell">
          <div className="workspace-heading">
            <div>
              <h2>{workspaceTitle}</h2>
              <p className="section-copy">{workspaceCopy}</p>
            </div>
            <div className="workspace-summary">
              <MetricCard label="Session" value={hasWalletConnection ? "Connected" : "Wallet offline"} />
              <MetricCard label="Library Artifacts" value={String(libraryArtifacts.length)} />
            </div>
          </div>

          <div className={`workspace-content ${activeWorkspace === "artifacts" ? `artifact-workspace artifact-workspace-${activeArtifactSection}` : ""}`}>
            {activeWorkspace === "artifacts" ? (
              <>
                <WorkspaceSectionNav
                  title="Artifact Sections"
                  items={artifactSectionItems}
                  activeKey={activeArtifactSection}
                  onChange={setActiveArtifactSection}
                />
                {artifactWorkspacePanel}
              </>
            ) : (
              agentWorkspacePanel
            )}
          </div>
        </section>
      </main>
    </>
  );
}

interface WorkspaceSectionNavItem<T extends string> {
  key: T;
  label: string;
}

function WorkspaceSectionNav<T extends string>({
  title,
  items,
  activeKey,
  onChange
}: {
  title: string;
  items: WorkspaceSectionNavItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="workspace-section-nav" role="tablist" aria-label={title}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === activeKey}
          className={`workspace-section-link ${item.key === activeKey ? "workspace-section-link-active" : ""}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function WorkspaceToggle({
  activeWorkspace,
  onChange
}: {
  activeWorkspace: WorkspaceKey;
  onChange: (workspace: WorkspaceKey) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dragX = useMotionValue(-340);
  const dragOpacity = useTransform(dragX, [-200, 0], [0, 1]);
  const items: Array<{ key: WorkspaceKey; label: string; icon: typeof User }> = [
    { key: "agent", label: "Agent", icon: User },
    { key: "artifacts", label: "Artifacts", icon: Archive }
  ];

  const menuTransition = {
    type: "spring",
    stiffness: 200,
    damping: 30,
    mass: 0.8
  } as const;
  const menuVariants = {
    closed: {
      x: "-100%",
      transition: menuTransition
    },
    open: {
      x: 0,
      transition: menuTransition
    }
  };
  const itemVariants = {
    closed: { x: -50, opacity: 0 },
    open: (index: number) => ({
      x: 0,
      opacity: 1,
      transition: {
        delay: 0.1 + index * 0.08,
        type: "spring",
        stiffness: 250,
        damping: 25
      } as const
    })
  };
  const overlayVariants = {
    closed: {
      opacity: 0,
      transition: {
        duration: 0.3
      }
    },
    open: {
      opacity: 1,
      transition: {
        duration: 0.4
      }
    }
  };

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x < -100) {
      setIsOpen(false);
      return;
    }

    void animate(dragX, 0, menuTransition);
  }

  function handleSelectWorkspace(workspace: WorkspaceKey) {
    onChange(workspace);
    setIsOpen(false);
  }

  useEffect(() => {
    const controls = animate(dragX, isOpen ? 0 : -340, menuTransition);

    return () => controls.stop();
  }, [dragX, isOpen, menuTransition]);

  return (
    <div className="workspace-menu" role="tablist" aria-label="Workspace switcher">
      <motion.button
        type="button"
        className="workspace-menu-button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Close workspace menu" : "Open workspace menu"}
        aria-expanded={isOpen}
        whileTap={{ scale: 0.94 }}
      >
        <Menu size={20} />
      </motion.button>

      <AnimatePresence>
        {isOpen ? (
          <motion.button
            type="button"
            className="workspace-menu-overlay"
            onClick={() => setIsOpen(false)}
            aria-label="Close workspace menu overlay"
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        className="workspace-side-menu"
        aria-hidden={!isOpen}
        style={{ x: dragX }}
        initial="closed"
        animate={isOpen ? "open" : "closed"}
        variants={menuVariants}
        drag="x"
        dragConstraints={{ left: -340, right: 0 }}
        dragElastic={0.08}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          className="workspace-menu-close"
          onClick={() => setIsOpen(false)}
          aria-label="Close workspace menu"
        >
          <X size={18} />
        </button>

        <motion.div style={{ opacity: dragOpacity }} className="workspace-menu-drag-hint" aria-hidden="true">
          <ChevronLeft size={18} />
        </motion.div>

        <div className="workspace-menu-content">
          <motion.div
            className="workspace-menu-heading"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : 16 }}
            transition={{ delay: 0.12, duration: 0.35 }}
          >
            <div>
              <span className="label">Workspace</span>
              <h2>Neura</h2>
            </div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: isOpen ? 80 : 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
            />
          </motion.div>

          <ul className="workspace-menu-list">
            {items.map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.li
                  key={item.key}
                  custom={index}
                  variants={itemVariants}
                  initial="closed"
                  animate={isOpen ? "open" : "closed"}
                >
                  <button
                    className={`workspace-side-item ${activeWorkspace === item.key ? "workspace-side-item-active" : ""}`}
                    type="button"
                    onClick={() => handleSelectWorkspace(item.key)}
                  >
                    <motion.span className="workspace-side-icon" whileHover={{ scale: 1.15, rotate: 8 }} whileTap={{ scale: 0.95 }}>
                      <Icon size={22} />
                    </motion.span>
                    <span>{item.label}</span>
                  </button>
                </motion.li>
              );
            })}
          </ul>

          <motion.div
            className="workspace-menu-footer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : 20 }}
            transition={{ delay: 0.36, duration: 0.35 }}
          >
            <FileText size={18} />
            <p>Artifact files are the reusable knowledge layer for the agent.</p>
          </motion.div>
        </div>
      </motion.aside>
    </div>
  );
}

function MetricCard({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="meta-card">
      <span className="label">{label}</span>
      <strong className={mono ? "mono-text" : undefined}>{value}</strong>
    </div>
  );
}

function ArtifactDetail({ artifact, compact = false }: { artifact: DemoArtifact; compact?: boolean }) {
  const fileBody = buildArtifactFileBody(artifact);

  return (
    <div className="artifact-detail">
      <div className="detail-grid compact-grid">
        <Detail label="File" value={artifactFileName(artifact)} mono />
        <Detail label="Size" value={formatArtifactFileSize(fileBody)} />
        <Detail label="Formula" value={artifact.formulaPattern || "No formula"} mono />
        {!compact ? <Detail label="Concepts" value={artifact.concepts.join(", ") || "None"} /> : null}
        {!compact ? <Detail label="Source" value={artifact.source === "upload" ? "Uploaded file" : "Marketplace file"} /> : null}
        {artifact.storage ? <Detail label="Storage" value={`${artifact.storage.provider} ${artifact.storage.status}`} /> : null}
        {artifact.storage?.network ? <Detail label="Network" value={artifact.storage.network} /> : null}
        {artifact.storage?.blobId ? <Detail label="Walrus Blob" value={shortId(artifact.storage.blobId)} mono /> : null}
        {artifact.storage?.transactionDigest ? (
          <Detail label="Storage TX" value={shortId(artifact.storage.transactionDigest)} mono />
        ) : null}
        {artifact.suiObjectId ? <Detail label="Sui Object" value={artifact.suiObjectId} mono /> : null}
      </div>
      <div className={`artifact-file-preview ${compact ? "artifact-file-preview-compact" : ""}`}>
        <div className="artifact-file-bar">
          <span className="artifact-file-icon">
            <FileText size={16} />
          </span>
          <div>
            <strong className="mono-text">{artifactFileName(artifact)}</strong>
            <span>{artifact.source === "upload" ? "Uploaded artifact file" : "Marketplace artifact file"}</span>
          </div>
        </div>
        <pre className="artifact-file-body">
          <code>{fileBody}</code>
        </pre>
      </div>
    </div>
  );
}

function PersistentArtifactDetail({ artifact, compact = false }: { artifact: PlatformArtifact; compact?: boolean }) {
  const version = artifact.versions[0];
  const content = version?.content ?? "";
  const caseCount = typeof version?.metadata?.caseCount === "number"
    ? String(version.metadata.caseCount)
    : String((content.match(/^###\s+/gm) ?? []).length);
  const formulaCount = artifact.domain === "excel" ? String((content.match(/^=.*$/gm) ?? []).length) : "Not applicable";

  return (
    <div className="artifact-detail">
      <div className="detail-grid compact-grid">
        <Detail label="File" value={persistentArtifactFileName(artifact)} mono />
        <Detail label="Size" value={formatArtifactFileSize(content)} />
        <Detail label="Version" value={`v${version?.version ?? 1}.0.0`} />
        <Detail label="Status" value={version?.status ?? "DRAFT"} />
        <Detail label="Domain" value={artifact.domain} />
        <Detail label="Knowledge cases" value={caseCount} />
        <Detail label="Formulas" value={formulaCount} />
        <Detail label="Storage" value="Neon PostgreSQL + pgvector" />
        {!compact ? <Detail label="Content hash" value={version?.contentHash ?? "Unavailable"} mono /> : null}
        {!compact ? <Detail label="Created" value={new Date(version?.createdAt ?? artifact.createdAt).toLocaleString()} /> : null}
        {version?.suiObjectId ? <Detail label="Sui Object" value={version.suiObjectId} mono /> : <Detail label="Sui" value="Awaiting publication" />}
        {version?.transactionDigest && !compact ? <Detail label="Sui transaction" value={version.transactionDigest} mono /> : null}
      </div>
      <div className={`artifact-file-preview ${compact ? "artifact-file-preview-compact" : ""}`}>
        <div className="artifact-file-bar">
          <span className="artifact-file-icon"><FileText size={16} /></span>
          <div>
            <strong className="mono-text">{persistentArtifactFileName(artifact)}</strong>
            <span>{version?.status === "PUBLISHED" ? "Published grounding artifact" : "Draft grounding artifact"}</span>
          </div>
          <span className={`library-badge ${version?.status === "PUBLISHED" ? "library-badge-on" : ""}`}>{version?.status ?? "DRAFT"}</span>
        </div>
        <pre className="artifact-file-body"><code>{content}</code></pre>
      </div>
    </div>
  );
}

function AgentChatTranscript({ question, answer }: { question: string; answer: AgentAnswer }) {
  const formula = answer.formula.trim();
  const explanation = answer.explanation.trim() || "No explanation returned.";
  const hasFormula = formula.length > 0;

  return (
    <div className="agent-chat-transcript" aria-live="polite">
      <div className="agent-chat-message agent-chat-message-user">
        <p>{question}</p>
      </div>

      <div className={`agent-chat-message agent-chat-message-assistant ${hasFormula ? "" : "agent-chat-message-rich"}`}>
        <div className="agent-chat-message-header">
          <span>{answer.label}</span>
          <span>{Math.round(answer.confidence * 100)}%</span>
        </div>
        {hasFormula ? (
          <>
            <pre className="chat-formula-block">
              <code>{formula}</code>
            </pre>
            <div className="chat-answer-copy">
              <ChatAnswerText text={explanation} />
            </div>
          </>
        ) : (
          <div className="chat-answer-block">
            <ChatAnswerText text={explanation} />
          </div>
        )}
        <div className="agent-chat-message-meta">
          <span>{answer.matchedArtifactTitle}</span>
          <span>{answer.artifactIds.length > 0 ? `${answer.artifactIds.length} artifact used` : "No artifact context"}</span>
          {answer.artifactIds.length > 0 ? <span className="mono-text">{shortId(answer.artifactIds[0] ?? "")}</span> : null}
        </div>
      </div>
    </div>
  );
}

function ChatAnswerText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </>
  );
}

function Field({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail">
      <span>{label}</span>
      <strong className={mono ? "mono-text" : undefined}>{value}</strong>
    </div>
  );
}

function RecordHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="record-header">
      <div>
        <p className="label">{subtitle}</p>
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="loading-state">
      <p>{message}</p>
    </div>
  );
}

function createEmptyUploadArtifactForm(): UploadArtifactFormState {
  return {
    title: "",
    questionPattern: "",
    formulaPattern: "",
    concepts: "",
    answer: ""
  };
}

function toDemoArtifact(artifact: AgentArtifactResource): DemoArtifact {
  return {
    id: artifact.id,
    title: artifact.title,
    difficulty: artifact.difficulty,
    tags: artifact.tags,
    questionPattern: artifact.questionPattern,
    formulaPattern: artifact.formulaPattern,
    concepts: artifact.concepts,
    answer: artifact.answer,
    ...(artifact.rawFormula !== null ? { rawFormula: artifact.rawFormula } : {}),
    rawAnswer: artifact.rawAnswer,
    source: artifact.source,
    creator: artifact.creator,
    version: artifact.version,
    usageCount: artifact.usageCount,
    benchmarkScore: artifact.benchmarkScore,
    storage: artifact.storage
  };
}

function toDemoComparison(result: AgentComparisonResult): AgentComparison {
  return {
    raw: toDemoAnswer(result.raw),
    augmented: toDemoAnswer(result.augmented),
    retrievedArtifacts: result.retrievedArtifacts.map(toDemoArtifact),
    runId: result.run.id
  };
}

function toDemoAnswer(answer: AgentAnswerResource): AgentAnswer {
  return {
    label: answer.label,
    formula: answer.formula,
    explanation: answer.explanation,
    confidence: answer.confidence,
    artifactIds: answer.artifactIds,
    matchedArtifactTitle: answer.matchedArtifactTitle,
    provider: answer.provider
  };
}

function formatError(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${mapApiErrorMessage(error)} (${error.code})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

function mapApiErrorMessage(error: ApiClientError) {
  switch (error.code) {
    case "ARTIFACT_NOT_FOUND":
      return "Artifact was not found in the marketplace or upload set.";
    case "ARTIFACT_NOT_IN_LIBRARY":
      return "Artifact is not currently installed in the library.";
    case "INVALID_AGENT_QUESTION":
      return "Enter a question before running the agent.";
    case "INVALID_AGENT_ARTIFACT":
      return "Uploaded artifacts need a title and answer.";
    default:
      return error.message;
  }
}

function shortId(value: string) {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function readStoredIds(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(ids));
  }
}

function normalizeLibraryIds(ids: string[]) {
  const uploadIds = ids.filter((id) => id.startsWith("upload-"));
  const marketplaceIds = ids.filter((id) => id === DEFAULT_AGENT_ARTIFACT_ID || id === SUI_AGENT_ARTIFACT_ID);
  const hasLegacyExcelArtifact = ids.some((id) => EXCEL_ARTIFACT_CASES.some((artifactCase) => artifactCase.id === id));
  const normalizedMarketplaceIds = uniqueStrings([
    ...marketplaceIds,
    ...(hasLegacyExcelArtifact ? [DEFAULT_AGENT_ARTIFACT_ID] : [])
  ]);

  return ids.length === 0
    ? [DEFAULT_AGENT_ARTIFACT_ID, ...uploadIds]
    : [...normalizedMarketplaceIds, ...uploadIds];
}

function readStoredArtifacts() {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(AGENT_UPLOADS_KEY);
  if (rawValue === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDemoArtifact);
  } catch {
    return [];
  }
}

function writeStoredArtifacts(artifacts: DemoArtifact[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AGENT_UPLOADS_KEY, JSON.stringify(artifacts));
  }
}

function createAgentChatTurnId() {
  const randomId = globalThis.crypto?.randomUUID?.();

  return randomId ?? `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isDemoArtifact(value: unknown): value is DemoArtifact {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DemoArtifact>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.questionPattern === "string" &&
    typeof candidate.formulaPattern === "string" &&
    typeof candidate.answer === "string" &&
    typeof candidate.rawAnswer === "string" &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.concepts) &&
    candidate.source === "upload"
  );
}

function mergeDemoArtifacts(baseArtifacts: DemoArtifact[], uploadedArtifacts: DemoArtifact[]) {
  const artifactsById = new Map<string, DemoArtifact>();

  for (const artifact of [...uploadedArtifacts, ...baseArtifacts]) {
    const existing = artifactsById.get(artifact.id);
    const suiObjectId = artifact.suiObjectId ?? existing?.suiObjectId;
    const mergedArtifact = { ...existing, ...artifact };
    artifactsById.set(artifact.id, suiObjectId ? { ...mergedArtifact, suiObjectId } : mergedArtifact);
  }

  return [...artifactsById.values()];
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildAgentComparison(
  question: string,
  libraryArtifacts: DemoArtifact[],
  marketplaceArtifacts: DemoArtifact[]
): AgentComparison {
  const marketplaceMatch = findBestArtifact(question, marketplaceArtifacts);
  const libraryMatch = findBestArtifact(question, libraryArtifacts);
  const marketplaceCase = findBestArtifactCase(question, marketplaceMatch);
  const libraryCase = findBestArtifactCase(question, libraryMatch);
  const raw: AgentAnswer = {
    label: "Raw LLM",
    formula: marketplaceCase?.rawFormula ?? marketplaceMatch?.rawFormula ?? "",
    explanation:
      marketplaceCase?.rawAnswer ??
      marketplaceMatch?.rawAnswer ??
      "The raw model gives a general answer, but no curated artifact is available for this exact pattern.",
    confidence: marketplaceMatch ? 0.74 : 0.58,
    artifactIds: [],
    matchedArtifactTitle: marketplaceMatch?.title ?? "General response"
  };
  const augmented: AgentAnswer = libraryMatch
    ? {
        label: "With Artifacts",
        formula: libraryCase?.formulaPattern ?? libraryMatch.formulaPattern,
        explanation: libraryCase?.answer ?? libraryMatch.answer,
        confidence: 0.93,
        artifactIds: [libraryMatch.id],
        matchedArtifactTitle: libraryMatch.title
      }
    : {
        label: "With Artifacts",
        formula: "",
        explanation: "No matching artifact is in the library yet. Add one from the marketplace or upload a custom artifact.",
        confidence: 0.41,
        artifactIds: [],
        matchedArtifactTitle: "Library context unavailable"
      };

  return { raw, augmented };
}

const excelSearchPatterns: Array<{ term: string; pattern: RegExp }> = [
  { term: "sumifs", pattern: /\b(?:sumifs|sum\s+if|sum\s+with|sum\s+where|sum\s+sales|total\s+sales|multiple\s+criteria|multi(?:ple)?\s+condition)/i },
  { term: "sum", pattern: /\b(?:sum|total|add|aggregate)\b/i },
  { term: "countifs", pattern: /\b(?:countifs|count\s+if|count\s+where|count\s+with)\b/i },
  { term: "xlookup", pattern: /\b(?:xlookup|lookup|look\s+up|find|return|salary|employee|exact\s+match)\b/i },
  { term: "vlookup", pattern: /\b(?:vlookup|column\s+index|left\s+lookup|right\s+lookup|avoid\s+vlookup)\b/i },
  { term: "filter", pattern: /\b(?:filter|where|amounts?\s+over|greater\s+than|over\s+\d+)\b/i },
  { term: "dynamic array", pattern: /\b(?:dynamic\s+array|spill|spilled|spill\s+range)\b/i },
  { term: "absolute reference", pattern: /(?:\$[a-z]{0,3}\$?\d+|[a-z]{1,3}\$\d+|\babsolute\b|\block\b|\bfixed\b|\bcopy(?:ied)?\b|\bdollar\b)/i },
  { term: "date criteria", pattern: /\b(?:date|after|before|since|between|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|20\d{2})\b/i },
  { term: "text numbers", pattern: /\b(?:text[-\s]?formatted|text\s+numbers?|stored\s+as\s+text|sum\s+is\s+0|sum\s+returns\s+0)\b/i },
  { term: "value", pattern: /\b(?:value|convert\s+to\s+number|number\s+conversion)\b/i },
  { term: "range", pattern: /\b[a-z]{1,3}\d*:[a-z]{1,3}\d*\b/i },
  { term: "criteria operator", pattern: /(?:>=|<=|<>|>|<|=)/ }
];

const suiSearchPatterns: Array<{ term: string; pattern: RegExp }> = [
  { term: "sui", pattern: /\bsui\b/i },
  { term: "stack", pattern: /\b(?:stack|component|components|architecture|layer\s*1)\b/i },
  { term: "objects", pattern: /\b(?:object|objects|ownership|owned|shared|immutable|object\s+id)\b/i },
  { term: "move", pattern: /\b(?:move|package|module|publish|upgrade|entry\s+function)\b/i },
  { term: "storage", pattern: /\b(?:walrus|storage|blob|publisher|aggregator|sdk|download|upload)\b/i },
  { term: "transactions", pattern: /\b(?:transaction|programmable\s+transaction|ptb|move\s+call|gas|atomic)\b/i }
];

function findBestArtifactCase(question: string, artifact: DemoArtifact | null) {
  if (artifact === null) {
    return null;
  }

  if (artifact.id === DEFAULT_AGENT_ARTIFACT_ID) {
    return findBestCase(question, EXCEL_ARTIFACT_CASES, extractExcelSearchTerms, 3);
  }

  if (artifact.id === SUI_AGENT_ARTIFACT_ID) {
    return findBestCase(question, SUI_ARTIFACT_CASES, extractSuiSearchTerms, 2);
  }

  return null;
}

function findBestCase(
  question: string,
  artifactCases: ArtifactCase[],
  extractSearchTerms: (value: string) => Set<string>,
  scoreThreshold: number
) {
  const queryTokens = tokenizeAgentText(question);
  const searchTerms = extractSearchTerms(question);
  let bestCase: ArtifactCase | null = null;
  let bestScore = 0;

  for (const artifactCase of artifactCases) {
    const score = scoreArtifactCase(queryTokens, searchTerms, artifactCase, extractSearchTerms);

    if (score > bestScore) {
      bestCase = artifactCase;
      bestScore = score;
    }
  }

  return bestScore >= scoreThreshold ? bestCase : null;
}

function scoreArtifactCase(
  queryTokens: Set<string>,
  querySearchTerms: Set<string>,
  artifactCase: ArtifactCase,
  extractSearchTerms: (value: string) => Set<string>
) {
  const candidateText = [
    artifactCase.title,
    artifactCase.questionPattern,
    artifactCase.formulaPattern,
    artifactCase.concepts.join(" "),
    artifactCase.tags.join(" "),
    artifactCase.answer
  ].join(" ");
  const candidateTokens = tokenizeAgentText(candidateText);
  const candidateSearchTerms = extractSearchTerms(candidateText);
  let score = countAgentTokenOverlap(queryTokens, candidateTokens);

  for (const term of querySearchTerms) {
    if (candidateSearchTerms.has(term)) {
      score += 5;
    }
  }

  const normalizedCandidateText = candidateText.toLowerCase();
  for (const token of queryTokens) {
    if (normalizedCandidateText.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function extractExcelSearchTerms(value: string) {
  const terms = new Set<string>();

  for (const { term, pattern } of excelSearchPatterns) {
    if (pattern.test(value)) {
      terms.add(term);
    }
  }

  const functionMatches = value.match(/\b[A-Z][A-Z0-9.]{2,}\s*\(/gi) ?? [];
  for (const match of functionMatches) {
    terms.add(match.replace(/\s*\($/, "").toLowerCase());
  }

  return terms;
}

function extractSuiSearchTerms(value: string) {
  const terms = new Set<string>();

  for (const { term, pattern } of suiSearchPatterns) {
    if (pattern.test(value)) {
      terms.add(term);
    }
  }

  return terms;
}

function findBestArtifact(question: string, artifacts: DemoArtifact[]) {
  const queryTokens = tokenizeAgentText(question);
  let bestArtifact: DemoArtifact | null = null;
  let bestScore = 0;

  for (const artifact of artifacts) {
    const candidateText =
      `${artifact.title} ${artifact.questionPattern} ${artifact.formulaPattern} ${artifact.concepts.join(" ")} ${artifact.tags.join(" ")}`;
    const candidateTokens = tokenizeAgentText(
      candidateText
    );
    let score = countAgentTokenOverlap(queryTokens, candidateTokens);

    if (
      artifact.id === SUI_AGENT_ARTIFACT_ID &&
      /\b(?:sui|move|object|ownership|programmable\s+transaction|ptb|walrus|storage)\b/i.test(question)
    ) {
      score += 3;
    }

    if (score > bestScore) {
      bestArtifact = artifact;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? bestArtifact : null;
}

function tokenizeAgentText(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(
        (token) =>
          (token.length >= 4 || token === "sui") &&
          !["with", "from", "what", "where", "when", "into"].includes(token)
      )
  );
}

function countAgentTokenOverlap(queryTokens: Set<string>, candidateTokens: Set<string>) {
  let score = 0;

  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function artifactFileName(artifact: DemoArtifact) {
  if (artifact.id === DEFAULT_AGENT_ARTIFACT_ID) {
    return "excel.md";
  }

  if (artifact.id === SUI_AGENT_ARTIFACT_ID) {
    return "sui.md";
  }

  return `${artifact.id}.artifact.md`;
}

function persistentArtifactFileName(artifact: PlatformArtifact) {
  const configuredName = artifact.versions[0]?.metadata?.fileName;
  return typeof configuredName === "string" && configuredName.trim().length > 0
    ? configuredName
    : `${artifact.domain}.v${artifact.versions[0]?.version ?? 1}.artifact.md`;
}

function formatArtifactFileSize(content: string) {
  const bytes = content.length;

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

function buildArtifactFileBody(artifact: DemoArtifact) {
  const artifactContent =
    artifact.id === DEFAULT_AGENT_ARTIFACT_ID || artifact.id === SUI_AGENT_ARTIFACT_ID
      ? artifact.answer
      : [
          `# ${artifact.title}`,
          "",
          "## Match Pattern",
          artifact.questionPattern,
          "",
          "## Formula Pattern",
          "```excel",
          artifact.formulaPattern || "No formula pattern",
          "```",
          "",
          "## Concepts",
          artifact.concepts.length > 0 ? artifact.concepts.map((concept) => `- ${concept}`).join("\n") : "- None",
          "",
          "## Artifact Answer",
          artifact.answer,
          "",
          "## Raw Baseline",
          artifact.rawAnswer,
          "",
          "## Retrieval Notes",
          "Use this file as the source of truth only when the user's question matches the pattern above."
        ].join("\n");
  const lines = [
    "---",
    `id: ${artifact.id}`,
    `title: ${artifact.title}`,
    `domain: ${artifact.id === SUI_AGENT_ARTIFACT_ID ? "sui" : "excel"}`,
    `source: ${artifact.source}`,
    `version: ${artifact.version ?? "local"}`,
    `difficulty: ${artifact.difficulty}`,
    `tags: ${artifact.tags.join(", ") || "none"}`,
    `storage: ${artifact.storage ? `${artifact.storage.provider}:${artifact.storage.status}` : "local"}`,
    artifact.storage?.blobId ? `walrusBlobId: ${artifact.storage.blobId}` : null,
    artifact.storage?.transactionDigest ? `storageTransactionDigest: ${artifact.storage.transactionDigest}` : null,
    "---",
    "",
    artifactContent
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function buildExcelArtifactFileBody() {
  return [
    "# Excel Artifact Pack",
    "",
    "A single Neura artifact file containing reusable Excel question patterns, formulas, concepts, and answer guidance.",
    "",
    "## Questions",
    "",
    EXCEL_ARTIFACT_CASES.map(renderExcelArtifactCase).join("\n\n")
  ].join("\n");
}

function renderExcelArtifactCase(artifactCase: ArtifactCase, index: number) {
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

function buildSuiArtifactFileBody() {
  return [
    "# Sui Docs Artifact Pack",
    "",
    "A Neura artifact file containing Sui and Walrus documentation Q&A for the agent benchmark.",
    "",
    "## Questions",
    "",
    SUI_ARTIFACT_CASES.map(renderSuiArtifactCase).join("\n\n")
  ].join("\n");
}

function renderSuiArtifactCase(artifactCase: ArtifactCase, index: number) {
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

function getDefaultQuestionForArtifact(artifact: DemoArtifact) {
  if (artifact.id === DEFAULT_AGENT_ARTIFACT_ID) {
    return DEFAULT_AGENT_QUESTION;
  }

  if (artifact.id === SUI_AGENT_ARTIFACT_ID) {
    return DEFAULT_SUI_AGENT_QUESTION;
  }

  return artifact.questionPattern;
}

function optionalField(key: string, value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? { [key]: trimmedValue } : {};
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
