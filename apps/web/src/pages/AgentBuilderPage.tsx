import { useEffect, useState, type FormEvent } from "react";
import { createPlatformAgent, listPlatformArtifacts, runPlatformAgent, submitRunFeedback, updatePlatformAgent, type PlatformAgent, type PlatformRun } from "../lib/api";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  web_search: "External access",
  artifact_search: "Workspace access",
  calculator: "Local utility",
  current_time: "System utility"
};

export function AgentBuilderPage({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("Sydney");
  const [instructions, setInstructions] = useState("Research the user's question, use approved knowledge artifacts, and return a concise answer with citations.");
  const [testInput, setTestInput] = useState("What are the latest important developments relevant to this question?");
  const [tools, setTools] = useState(["web_search", "artifact_search", "calculator", "current_time"]);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; title: string; versions: Array<{ status: string }> }>>([]);
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const [agent, setAgent] = useState<PlatformAgent | null>(null);
  const [run, setRun] = useState<PlatformRun | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listPlatformArtifacts().then(setArtifacts).catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load artifacts")); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setStatus("Creating and testing agent…"); try { const created = await createPlatformAgent({ name, instructions, enabledTools: tools, artifactIds, maxSteps: 5 }); setAgent(created); const result = await runPlatformAgent(created.id, testInput); setRun(result); setStatus("Test completed. Review the answer and trace before activation."); } catch (error) { setStatus(error instanceof Error ? error.message : "Agent test failed"); } finally { setBusy(false); } }
  async function activate() { if (!agent || run?.status !== "COMPLETED") return; const next = await updatePlatformAgent(agent.id, { status: "ACTIVE" }); setAgent(next); setStatus("Agent activated."); }
  const toggle = (value: string, current: string[], set: (next: string[]) => void) => set(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const availableArtifacts = artifacts.filter((item) => item.versions.some((version) => version.status !== "ARCHIVED"));

  return (
    <div className="agent-builder-page">
      <header className="agent-builder-topbar">
        <div className="agent-builder-brand">
          <button className="agent-builder-icon-button agent-builder-back-icon" type="button" onClick={onBack} aria-label="Back to workspace">
            <span aria-hidden="true">‹</span>
          </button>
          <span className="agent-builder-icon-button agent-builder-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <strong>Neura</strong>
        </div>
        <span className="agent-builder-topbar-context">Agent Studio</span>
      </header>

      <aside className="agent-builder-sidebar" aria-hidden="true">
        <span className="agent-builder-sidebar-label">Workspace</span>
        <div className="agent-builder-sidebar-list">
          <span className="agent-builder-sidebar-item agent-builder-sidebar-item-active">Create Agent</span>
          <span className="agent-builder-sidebar-item">Marketplace</span>
          <span className="agent-builder-sidebar-item">History</span>
        </div>
      </aside>

      <main className="agent-builder-main">
        <div className="agent-builder-heading">
          <button className="agent-builder-back-link" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span>
            Back to workspace
          </button>
          <h1>Create a capable agent</h1>
          <p>Configure instructions, tools, and approved knowledge, then verify a real run before activation.</p>
        </div>

        <form className="agent-builder-form" onSubmit={submit}>
          <label className="agent-builder-field">
            <span className="agent-builder-field-label">Agent Name</span>
            <span className="agent-builder-input-shell">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Give your agent a name..." />
            </span>
          </label>

          <label className="agent-builder-field">
            <span className="agent-builder-field-label">Instructions</span>
            <span className="agent-builder-input-shell agent-builder-textarea-shell">
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} placeholder="Describe what the agent should do..." />
            </span>
          </label>

          <fieldset className="agent-builder-fieldset">
            <legend className="agent-builder-field-label">Enabled Tools</legend>
            <div className="agent-builder-option-grid">
              {["web_search", "artifact_search", "calculator", "current_time"].map((tool) => (
                <label className="agent-builder-option-card" key={tool}>
                  <span>
                    <strong>{tool}</strong>
                    <small>{TOOL_DESCRIPTIONS[tool]}</small>
                  </span>
                  <input type="checkbox" checked={tools.includes(tool)} onChange={() => toggle(tool, tools, setTools)} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="agent-builder-fieldset">
            <legend className="agent-builder-field-label">Workspace Artifacts</legend>
            {availableArtifacts.length > 0 ? (
              <div className="agent-builder-artifact-grid">
                {availableArtifacts.map((item) => (
                  <label className="agent-builder-option-card agent-builder-artifact-card" key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{artifactIds.includes(item.id) ? "Approved knowledge selected" : "Available workspace knowledge"}</small>
                    </span>
                    <input type="checkbox" checked={artifactIds.includes(item.id)} onChange={() => toggle(item.id, artifactIds, setArtifactIds)} />
                  </label>
                ))}
              </div>
            ) : (
              <div className="agent-builder-artifact-empty">
                <span aria-hidden="true">+</span>
                No artifacts selected. Add approved knowledge from the workspace.
              </div>
            )}
          </fieldset>

          <label className="agent-builder-field">
            <span className="agent-builder-field-label">Test Prompt Console</span>
            <span className="agent-builder-input-shell agent-builder-textarea-shell agent-builder-test-shell">
              <textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} rows={3} placeholder="Enter a prompt to test your agent..." />
            </span>
          </label>

          <div className="agent-builder-submit-area">
            <button className="agent-builder-submit" disabled={busy} type="submit">
              {busy ? "Running..." : "Create and Test Agent"}
            </button>
            {status ? <p className="agent-builder-status" role="status"><span aria-hidden="true">i</span>{status}</p> : null}
          </div>
        </form>

        {run ? (
          <section className="agent-builder-result">
            <div className="agent-builder-result-heading">
              <span className="agent-builder-field-label">Verification Run</span>
              <h2>Test result</h2>
            </div>
            <p className="agent-builder-result-output">{run.output ?? run.error}</p>
            <div className="agent-builder-result-grid">
              <div>
                <h3>Sources</h3>
                <ul>{run.citations.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
              </div>
              <div>
                <h3>Execution trace</h3>
                <ol>{run.steps.map((step) => <li key={step.id}>{step.kind}{step.toolName ? `: ${step.toolName}` : ""} ({step.durationMs ?? 0}ms){step.error ? ` — ${step.error}` : ""}</li>)}</ol>
              </div>
            </div>
            <div className="agent-builder-result-actions">
              <button className="agent-builder-submit agent-builder-activate" onClick={activate} disabled={agent?.status === "ACTIVE"}>Activate agent</button>
              <button className="agent-builder-secondary-button" onClick={() => void submitRunFeedback(run.id, 1)}>Useful</button>
              <button className="agent-builder-secondary-button" onClick={() => void submitRunFeedback(run.id, -1)}>Needs correction</button>
            </div>
          </section>
        ) : null}
      </main>

      <nav className="agent-builder-mobile-nav" aria-hidden="true">
        <span className="agent-builder-mobile-nav-active">Create</span>
        <span>Market</span>
        <span>Profile</span>
      </nav>
    </div>
  );
}
