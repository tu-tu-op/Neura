import { Reveal } from "../../components/landing/Reveal";
import { SectionHeading } from "../../components/landing/SectionHeading";

const architectureCards = [
  {
    title: "Walrus Storage",
    label: "Versioning",
    copy: "Every artifact version is represented as an immutable storage object with a root hash anchored to platform records."
  },
  {
    title: "Sui",
    label: "Contracts",
    copy: "Artifact publishing, correction submission, and library registration flow through low-cost smart contract primitives."
  },
  {
    title: "Model Pipeline",
    label: "Improvement",
    copy: "High-consensus artifact versions can trigger provider-neutral model update jobs and attach resulting model hashes to the artifact lineage."
  },
  {
    title: "Agent ID",
    label: "Reputation",
    copy: "Expert identity and historical consensus quality become part of the economic security model for labels."
  }
];

export function ArchitectureSection() {
  return (
    <section className="landing-section" id="architecture">
      <div className="landing-container">
        <Reveal>
          <SectionHeading
            kicker="Architecture"
            title="Every infrastructure layer is load-bearing"
            copy="The Stitch export's architecture story has been converted into responsive React sections that mirror the working dashboard: agent runs, storage proofs, and artifact libraries."
          />
        </Reveal>

        <Reveal className="landing-architecture-map">
          <h3>System overview</h3>
          <pre>
{`React Workspace       <->  API Service       <->  Sui
Artifact Library      ->   Walrus Storage  ->   Versioned Artifacts
Consensus Engine      ->   Model Pipeline  ->   Improved Agent`}
          </pre>
          <div className="landing-tech-strip">
            <span>React + Vite</span>
            <span>Sui Move packages</span>
            <span>Walrus SDK</span>
            <span>Agent artifact library</span>
          </div>
        </Reveal>

        <div className="landing-architecture-grid">
          {architectureCards.map((card, index) => (
            <Reveal className="landing-architecture-card" delay={index % 2 === 0 ? "short" : "medium"} key={card.title}>
              <p className="landing-kicker">{card.label}</p>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
