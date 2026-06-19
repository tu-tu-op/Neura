import { LandingButton } from "../../components/landing/LandingButton";
import { Reveal } from "../../components/landing/Reveal";
import { SectionHeading } from "../../components/landing/SectionHeading";

interface RoadmapSectionProps {
  onLaunchApp: () => void;
}

const roadmap = [
  ["Week 1", "Agent comparison, artifact library, marketplace, and upload flows."],
  ["MVP", "Artifact versioning, storage proof surfaces, and agent marketplace distribution."],
  ["Next", "Consensus scoring, automated training triggers, and buyer SDK packaging."],
  ["Scale", "Multi-domain agent artifacts with reputation-weighted expert networks."]
];

const postMvpPillars = [
  {
    icon: "01",
    label: "Security",
    title: "Sentinel",
    subtitle: "On-Chain Agent Integrity Layer",
    body: "Before any agent is listed, it passes through Sentinel — an autonomous inspection pipeline that determines whether an agent is genuinely listed for improvement or covertly exploiting the platform.",
    bullets: [
      "Static AST inspection for exploit signatures & unauthorized calls",
      "Sandboxed execution tracing against adversarial inputs",
      "Reputation-gated listing with provisional state for new agents",
      "Continuous re-attestation on every code or config update"
    ],
    accent: "cyan"
  },
  {
    icon: "02",
    label: "Economy",
    title: "Dual-Path Training",
    subtitle: "Platform Artifacts vs. Open Marketplace",
    body: "Neura operates a two-tier training economy giving agent developers flexibility while preserving cost efficiency and quality signal.",
    bullets: [
      "Tier 1: Pay-per-use micro-payments against on-chain artifact corpus",
      "Tier 2: Open labeling marketplace with structured LabelTask bounties",
      "Consensus-verified labels minted as versioned DatasetNFTs",
      "LoRA adapter jobs auto-dispatched to the configured model provider on threshold"
    ],
    accent: "green"
  },
  {
    icon: "03",
    label: "Contributors",
    title: "Contributor Economy",
    subtitle: "Researchers as First-Class Stakeholders",
    body: "Researchers, domain specialists, and organizations can monetize high-quality knowledge through passive royalties or active marketplace participation.",
    bullets: [
      "Publish & earn: on-chain royalty events on every artifact retrieval",
      "Quality score drives utilization multipliers and index priority",
      "Marketplace path: precision labeling work for maximum yield",
      "Verified Expert status unlocks higher-bounty private task routing"
    ],
    accent: "amber"
  }
];

const furtherHorizon = [
  { cap: "DatasetNFT Secondary Market", desc: "Price-discovery for dataset NFTs algorithmically tied to measurable performance delta — verifiable, tradeable data assets." },
  { cap: "Agent ID & Reputation Ledger", desc: "Every agent accumulates an on-chain identity tracking full model version history with auditable fine-tuning lineage." },
  { cap: "Labeler Slashing & Staking V2", desc: "Full slash logic for bad-faith label submissions with graduated slashing curve proportional to severity and reputation." },
  { cap: "Autonomous Agent-Initiated Tasks", desc: "The terminal form: deployed agents autonomously post labeling tasks when inference confidence falls below a threshold." },
  { cap: "TEE-Based Label Privacy", desc: "Confidential compute enclaves for sensitive labeling tasks — medical, legal, financial — where label content stays private." },
  { cap: "Multi-Agent Task Routing", desc: "Intelligent dispatch to the labeler pool most likely to produce high-consensus results based on domain history." }
];

export function RoadmapSection({ onLaunchApp }: RoadmapSectionProps) {
  return (
    <section className="landing-section landing-roadmap-section" id="roadmap">
      <div className="landing-container">
        <Reveal>
          <SectionHeading
            kicker="Roadmap"
            title="From working dashboard to data layer for the agentic economy"
            copy="The landing narrative now sits in front of the product, while the existing dashboard remains the execution layer behind every CTA."
          />
        </Reveal>
        <div className="landing-roadmap">
          {roadmap.map(([phase, copy], index) => (
            <Reveal className="landing-roadmap-item" delay={index < 2 ? "short" : "medium"} key={phase}>
              <span>{phase}</span>
              <p>{copy}</p>
            </Reveal>
          ))}
        </div>

        {/* ── Post-MVP Announcement ─────────────────────────────────────── */}
        <Reveal delay="medium">
          <div className="roadmap-announcement">
            <div className="roadmap-announcement-header">
              <div className="roadmap-announcement-badge">
                <span className="roadmap-announcement-badge-dot" aria-hidden="true" />
                Post-MVP
              </div>
              <h3 className="roadmap-announcement-title">
                The full Neura economy — trustless, composable, self-sustaining.
              </h3>
              <p className="roadmap-announcement-lead">
                What comes after the artifact retrieval loop is proven. Three architectural pillars that
                transform Neura from a labeling platform into a permissionless data economy on Sui.
              </p>
            </div>

            <div className="roadmap-pillars">
              {postMvpPillars.map((pillar, i) => (
                <div className={`roadmap-pillar roadmap-pillar-${pillar.accent}`} key={pillar.title}>
                  <div className="roadmap-pillar-top">
                    <span className="roadmap-pillar-index" aria-hidden="true">{pillar.icon}</span>
                    <span className={`roadmap-pillar-label roadmap-pillar-label-${pillar.accent}`}>{pillar.label}</span>
                  </div>
                  <h4 className="roadmap-pillar-title">{pillar.title}</h4>
                  <p className="roadmap-pillar-subtitle">{pillar.subtitle}</p>
                  <p className="roadmap-pillar-body">{pillar.body}</p>
                  <ul className="roadmap-pillar-bullets">
                    {pillar.bullets.map((b) => (
                      <li key={b}>
                        <span className={`roadmap-bullet-dot roadmap-bullet-dot-${pillar.accent}`} aria-hidden="true" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Further Horizon */}
            <div className="roadmap-horizon">
              <div className="roadmap-horizon-header">
                <span className="roadmap-horizon-kicker">Further Horizon</span>
                <p>Beyond the three pillars above, the following capabilities are on the long-term roadmap.</p>
              </div>
              <div className="roadmap-horizon-grid">
                {furtherHorizon.map((item) => (
                  <div className="roadmap-horizon-item" key={item.cap}>
                    <strong>{item.cap}</strong>
                    <p>{item.desc}</p>
                  </div>
                ))}
              </div>
              <p className="roadmap-horizon-footnote">
                Neura Post-MVP is not a feature list — it is the architecture of a self-sustaining data economy
                where every agent failure becomes a monetizable signal, every expert becomes a stakeholder,
                and every dataset becomes a tradeable, provenance-verified asset on Sui.
              </p>
            </div>
          </div>
        </Reveal>
        {/* ── /Post-MVP Announcement ────────────────────────────────────── */}

        <Reveal className="landing-final-cta">
          <h3>Ready to inspect the live workspace?</h3>
          <LandingButton variant="primary" onClick={onLaunchApp}>
            Launch App
          </LandingButton>
        </Reveal>
      </div>
    </section>
  );
}
