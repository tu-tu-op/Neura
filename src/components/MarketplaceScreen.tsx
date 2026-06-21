/**
 * MarketplaceScreen — dark glassmorphism theme matching stitch-export/Marketplace.html
 * Connects to GET /v1/agent/marketplace/artifacts, POST /v1/agent/library/artifacts,
 * DELETE /v1/agent/library/artifacts/:id, POST /v1/agent/artifacts/upload
 */

import { useState, useEffect, useRef } from "react";
import { Screen, MarketplaceArtifact } from "../types";

const API_BASE = "http://localhost:3000";

// ── Static seed fallback (mirrors marketplace.ts data) ────────────────────────
const SEED_ARTIFACTS: MarketplaceArtifact[] = [
  {
    id: "excel",
    title: "Excel Artifact Pack",
    domain: "excel",
    difficulty: "medium",
    tags: ["aggregation", "lookup", "dynamic arrays", "date criteria", "debugging"],
    concepts: ["SUMIFS", "XLOOKUP", "FILTER", "absolute references", "VALUE"],
    usageCount: 1516,
    benchmarkScore: 0.91,
    creator: "DataLoop",
    source: "marketplace",
    inLibrary: true,
  },
  {
    id: "sui",
    title: "Sui Docs Artifact Pack",
    domain: "sui",
    difficulty: "medium",
    tags: ["sui", "move", "walrus", "objects", "ai agents"],
    concepts: ["Sui", "Move", "Walrus Storage", "programmable transaction block", "object-centric data model"],
    usageCount: 1503,
    benchmarkScore: 0.916,
    creator: "DataLoop",
    source: "marketplace",
    inLibrary: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
type DomainFilter = "all" | "excel" | "sui";

function pct(score: number | null) {
  return score !== null ? Math.round(score * 100) : 0;
}

const DOMAIN_EMOJI: Record<string, string> = { excel: "📊", sui: "🔷" };

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  const p = pct(score);
  return (
    <div className="mb-4">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280" }}>Benchmark Score</span>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "#a78bfa" }}>{p}%</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "999px", height: "4px", width: "100%" }}>
        <div style={{ width: `${p}%`, height: "4px", borderRadius: "999px", background: "linear-gradient(90deg,#8b5cf6,#a78bfa)", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  const styles: Record<string, React.CSSProperties> = {
    excel: { background: "rgba(34,197,94,0.12)", color: "#6ee7b7", border: "1px solid rgba(34,197,94,0.2)" },
    sui:   { background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.25)" },
  };
  return (
    <span style={{ ...styles[domain], fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "3px 10px", borderRadius: "999px", display: "inline-block" }}>
      {domain}
    </span>
  );
}

function DifficultyPill({ difficulty }: { difficulty: string }) {
  const styles: Record<string, React.CSSProperties> = {
    easy:   { background: "rgba(34,197,94,0.15)",  color: "#86efac", border: "1px solid rgba(34,197,94,0.25)" },
    medium: { background: "rgba(234,179,8,0.15)",  color: "#fde68a", border: "1px solid rgba(234,179,8,0.25)" },
    hard:   { background: "rgba(239,68,68,0.15)",  color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" },
  };
  return (
    <span style={{ ...styles[difficulty], fontSize: "10px", fontWeight: 600, textTransform: "uppercase", padding: "3px 10px", borderRadius: "999px", display: "inline-block" }}>
      {difficulty}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#9ca3af", fontSize: "10px", padding: "2px 8px", borderRadius: "6px" }}>
      {label}
    </span>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
interface UploadModalProps {
  onClose: () => void;
  onUploaded: (artifact: MarketplaceArtifact) => void;
}

function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [title, setTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [qPattern, setQPattern] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !answer.trim()) { setError("Title and content are required."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/agent/artifacts/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), answer: answer.trim(), questionPattern: qPattern.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const json = await res.json() as { data: { artifact: MarketplaceArtifact } };
      onUploaded({ ...json.data.artifact, inLibrary: true });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div style={{ background: "rgba(20,20,20,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", padding: "32px", width: "100%", maxWidth: "480px", margin: "0 16px", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "50%", cursor: "pointer", color: "#9ca3af" }}>✕</button>
        <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>Upload Custom Artifact</h3>
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "24px" }}>Add your own knowledge file to the agent library.</p>

        {(["Title", "Knowledge Content", "Question Pattern (optional)"] as const).map((lbl, i) => (
          <div key={lbl} style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", marginBottom: "8px" }}>{lbl}</label>
            {i === 1
              ? <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Paste your Q&A, docs, or formula reference…" rows={4}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px", fontSize: "13px", color: "#e5e7eb", outline: "none", resize: "vertical", fontFamily: "Montserrat, sans-serif" }} />
              : <input value={i === 0 ? title : qPattern} onChange={e => i === 0 ? setTitle(e.target.value) : setQPattern(e.target.value)}
                  placeholder={i === 0 ? "e.g. Python Data Science Q&A" : "e.g. How do I use pandas groupby?"}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px", fontSize: "13px", color: "#e5e7eb", outline: "none", fontFamily: "Montserrat, sans-serif", boxSizing: "border-box" }} />
            }
          </div>
        ))}

        {error && <p style={{ color: "#f87171", fontSize: "12px", marginBottom: "12px" }}>{error}</p>}
        <button
          onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: "14px", borderRadius: "12px", background: loading ? "rgba(139,92,246,0.4)" : "#8b5cf6", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", fontFamily: "Montserrat, sans-serif" }}
        >
          {loading ? "Uploading…" : "Upload & Add to Library"}
        </button>
      </div>
    </div>
  );
}

// ── Artifact Card ─────────────────────────────────────────────────────────────
interface ArtifactCardProps {
  artifact: MarketplaceArtifact;
  onToggleLibrary: (id: string, inLibrary: boolean) => void;
  index: number;
}

function ArtifactCard({ artifact, onToggleLibrary, index }: ArtifactCardProps) {
  const [hovered, setHovered] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (artifact.inLibrary) {
        await fetch(`${API_BASE}/v1/agent/library/artifacts/${artifact.id}`, { method: "DELETE" });
      } else {
        await fetch(`${API_BASE}/v1/agent/library/artifacts`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifactId: artifact.id }),
        });
      }
    } catch {
      // fall through — optimistic UI already applied
    } finally {
      setToggling(false);
    }
    onToggleLibrary(artifact.id, !artifact.inLibrary);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.03)",
        backdropFilter: "blur(10px)",
        border: hovered ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: "20px", padding: "24px",
        transition: "all 0.2s ease",
        animation: `fadeUp 0.35s ease ${index * 80}ms both`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            <DomainBadge domain={artifact.domain} />
            <DifficultyPill difficulty={artifact.difficulty} />
          </div>
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: "0 0 6px" }}>{artifact.title}</h2>
          <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>by {artifact.creator}</p>
        </div>
        <div style={{
          width: "48px", height: "48px", borderRadius: "14px", flexShrink: 0,
          background: artifact.domain === "excel" ? "rgba(34,197,94,0.1)" : "rgba(139,92,246,0.1)",
          border: artifact.domain === "excel" ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(139,92,246,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px",
        }}>
          {DOMAIN_EMOJI[artifact.domain] ?? "📦"}
        </div>
      </div>

      {/* Score Bar */}
      <ScoreBar score={artifact.benchmarkScore} />

      {/* Tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
        {artifact.tags.slice(0, 6).map(t => <Tag key={t} label={t} />)}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: "11px", color: "#6b7280" }}>
          {artifact.usageCount.toLocaleString()} uses
        </span>
        <button
          onClick={handleToggle} disabled={toggling}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 16px", borderRadius: "12px", fontSize: "11px", fontWeight: 700,
            cursor: toggling ? "wait" : "pointer", transition: "all 0.2s", border: "1px solid",
            fontFamily: "Montserrat, sans-serif",
            ...(artifact.inLibrary
              ? { background: "rgba(139,92,246,0.18)", borderColor: "rgba(139,92,246,0.4)", color: "#c4b5fd" }
              : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "#d1d5db" }),
          }}
        >
          {toggling ? "…" : artifact.inLibrary ? "✓ In Library" : "+ Add to Library"}
        </button>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
interface MarketplaceScreenProps {
  onNavigate: (screen: Screen) => void;
}

export default function MarketplaceScreen({ onNavigate }: MarketplaceScreenProps) {
  const [artifacts, setArtifacts] = useState<MarketplaceArtifact[]>(SEED_ARTIFACTS);
  const [filter, setFilter] = useState<DomainFilter>("all");
  const [query, setQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [apiStatus, setApiStatus] = useState<"loading" | "ok" | "offline">("loading");
  const spotlightRef = useRef<HTMLDivElement>(null);

  // Spotlight mouse tracking
  useEffect(() => {
    const el = spotlightRef.current; if (!el) return;
    const move = (e: MouseEvent) => {
      const rect = el.parentElement!.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Fetch marketplace artifacts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mktRes, libRes] = await Promise.all([
          fetch(`${API_BASE}/v1/agent/marketplace/artifacts`),
          fetch(`${API_BASE}/v1/agent/library`),
        ]);
        if (!mktRes.ok) throw new Error("api error");
        const mktJson = await mktRes.json() as { data: { artifacts: MarketplaceArtifact[] } };
        const libJson = libRes.ok ? await libRes.json() as { data: { artifacts: { id: string }[] } } : { data: { artifacts: [] } };
        const libIds = new Set(libJson.data.artifacts.map(a => a.id));
        if (!cancelled) {
          setArtifacts(mktJson.data.artifacts.map(a => ({ ...a, inLibrary: libIds.has(a.id) })));
          setApiStatus("ok");
        }
      } catch {
        if (!cancelled) setApiStatus("offline");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleLibrary = (id: string, inLibrary: boolean) => {
    setArtifacts(prev => prev.map(a => a.id === id ? { ...a, inLibrary } : a));
  };

  const handleUploaded = (artifact: MarketplaceArtifact) => {
    setArtifacts(prev => [artifact, ...prev]);
  };

  const visible = artifacts.filter(a =>
    (filter === "all" || a.domain === filter) &&
    (query === "" || `${a.title} ${a.tags.join(" ")} ${a.concepts.join(" ")}`.toLowerCase().includes(query.toLowerCase()))
  );

  const libraryCount = artifacts.filter(a => a.inLibrary).length;

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600,
    cursor: "pointer", border: "none", transition: "all 0.2s", fontFamily: "Montserrat, sans-serif",
    ...(active
      ? { background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.5)", color: "#c4b5fd" }
      : { background: "transparent", color: "#6b7280" }),
  });

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0a0a0a", color: "#e5e7eb", fontFamily: "Montserrat, sans-serif", overflowY: "auto", overflowX: "hidden" }}>
      {/* Inject keyframe */}
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Dot grid */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px,transparent 1px)", backgroundSize: "30px 30px", pointerEvents: "none", zIndex: 0 }} />

      {/* Spotlight */}
      <div ref={spotlightRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, background: "radial-gradient(circle 450px at var(--mx,50%) var(--my,30%),rgba(139,92,246,0.13),transparent 80%)" }} />

      {/* Top Nav */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "64px", background: "rgba(10,10,10,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => onNavigate(Screen.Inbox)}
            style={{ width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "50%", cursor: "pointer", color: "#9ca3af" }}
          >
            ‹
          </button>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Neura</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {apiStatus === "offline" && (
            <span style={{ fontSize: "10px", color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", padding: "4px 12px", borderRadius: "999px" }}>
              Offline — demo mode
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 16px", borderRadius: "999px", background: "rgba(20,20,20,0.5)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "11px" }}>
            <span style={{ color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Network</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#fff", fontWeight: 500 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#8b5cf6", display: "inline-block", animation: "pulse 2s infinite" }} />
              Sui Testnet
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, padding: "32px 24px 100px", maxWidth: "900px", margin: "0 auto" }}>

        {/* Page Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.03em", color: "#fff", margin: "0 0 8px" }}>Artifact Marketplace</h1>
            <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>Browse curated knowledge packs and add them to your agent library.</p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {[{ label: "Available", value: artifacts.length, accent: "#fff" }, { label: "In Library", value: libraryCount, accent: "#a78bfa" }].map(s => (
              <div key={s.label} style={{ background: "rgba(20,20,20,0.5)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "14px 20px", textAlign: "center", minWidth: "100px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", marginBottom: "4px" }}>{s.label}</div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: s.accent }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
            <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#6b7280", fontSize: "14px" }}>🔍</span>
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search artifacts, tags, concepts…"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "12px 16px 12px 40px", fontSize: "13px", color: "#e5e7eb", outline: "none", fontFamily: "Montserrat, sans-serif", boxSizing: "border-box" }}
            />
          </div>
          {/* Filter chips */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px", background: "rgba(20,20,20,0.5)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px" }}>
            {(["all", "excel", "sui"] as DomainFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: "20px" }}>
          {visible.map((artifact, i) => (
            <ArtifactCard key={artifact.id} artifact={artifact} onToggleLibrary={toggleLibrary} index={i} />
          ))}
          {visible.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔍</div>
              <p style={{ color: "#6b7280", fontSize: "14px" }}>No artifacts match your search.</p>
            </div>
          )}
        </div>

        {/* Footer badge */}
        <div style={{ marginTop: "40px", display: "flex", justifyContent: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "999px", background: "rgba(20,20,20,0.5)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.07)", fontSize: "11px", color: "#6b7280" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#8b5cf6", display: "inline-block" }} />
            Artifacts stored on Walrus · verified on Sui Testnet
          </div>
        </div>
      </div>

      {/* Upload FAB */}
      <button
        onClick={() => setShowUpload(true)}
        style={{ position: "fixed", bottom: "24px", right: "24px", display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderRadius: "999px", background: "#8b5cf6", color: "#fff", fontWeight: 700, fontSize: "12px", border: "none", cursor: "pointer", zIndex: 30, boxShadow: "0 8px 32px rgba(139,92,246,0.4)", transition: "all 0.2s", fontFamily: "Montserrat, sans-serif" }}
      >
        + Upload Artifact
      </button>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />}
    </div>
  );
}
