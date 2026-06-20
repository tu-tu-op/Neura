import { useEffect, useState, type FormEvent } from "react";
import { createPlatformAgent, listPlatformArtifacts, runPlatformAgent, submitRunFeedback, updatePlatformAgent, type PlatformAgent, type PlatformRun } from "../lib/api";

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
  return <main style={{ maxWidth: 920, margin: "0 auto", padding: 32, fontFamily: "Inter, sans-serif" }}>
    <button onClick={onBack}>← Back to workspace</button><h1>Create a capable agent</h1><p>Configure instructions, tools, and approved knowledge, then verify a real run before activation.</p>
    <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", padding: 10 }} /></label>
      <label>Instructions<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} style={{ display: "block", width: "100%", padding: 10 }} /></label>
      <fieldset><legend>Tools</legend>{["web_search", "artifact_search", "calculator", "current_time"].map((tool) => <label key={tool} style={{ marginRight: 18 }}><input type="checkbox" checked={tools.includes(tool)} onChange={() => toggle(tool, tools, setTools)} /> {tool}</label>)}</fieldset>
      <fieldset><legend>Workspace artifacts</legend>{artifacts.filter((item) => item.versions.some((v) => v.status !== "ARCHIVED")).map((item) => <label key={item.id} style={{ display: "block" }}><input type="checkbox" checked={artifactIds.includes(item.id)} onChange={() => toggle(item.id, artifactIds, setArtifactIds)} /> {item.title}</label>)}</fieldset>
      <label>Test prompt<textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} rows={3} style={{ display: "block", width: "100%", padding: 10 }} /></label>
      <button disabled={busy} type="submit">{busy ? "Running…" : "Create and test"}</button>
    </form>
    {status && <p>{status}</p>}
    {run && <section><h2>Test result</h2><p>{run.output ?? run.error}</p><h3>Sources</h3><ul>{run.citations.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><h3>Execution trace</h3><ol>{run.steps.map((step) => <li key={step.id}>{step.kind}{step.toolName ? `: ${step.toolName}` : ""} ({step.durationMs ?? 0}ms){step.error ? ` — ${step.error}` : ""}</li>)}</ol><div style={{ display: "flex", gap: 12 }}><button onClick={activate} disabled={agent?.status === "ACTIVE"}>Activate agent</button><button onClick={() => void submitRunFeedback(run.id, 1)}>Useful</button><button onClick={() => void submitRunFeedback(run.id, -1)}>Needs correction</button></div></section>}
  </main>;
}
