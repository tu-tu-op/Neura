import { Reveal } from "../../components/landing/Reveal";
import { SectionHeading } from "../../components/landing/SectionHeading";

const rows = [
  ["Data creation", "Ad-hoc, one-time, expensive", "Continuous, rewarded, on-chain"],
  ["Labeler identity", "Anonymous crowdworkers", "Staked, reputation-scored experts"],
  ["Artifact ownership", "Locked in private buckets", "Tokenized, shared, tradeable"],
  ["Fine-tuning trigger", "Manual and infrequent", "Automated when quality thresholds clear"]
];

export function ProblemSection() {
  return (
    <section className="landing-section" id="problem">
      <div className="landing-container">
        <Reveal>
          <SectionHeading
            align="center"
            kicker="The Data Bottleneck"
            title="AI agents stop improving the moment they ship"
            copy="Specialized agents need correction data from real operators. That data rarely exists, and traditional labeling markets are not built for provenance, ownership, or continuous improvement."
          />
        </Reveal>

        <div className="landing-problem-grid">
          <Reveal className="landing-bento landing-copy-card">
            <div className="landing-card-shine" aria-hidden="true" />
            <h3>The fine-tuning data gap</h3>
            <p>
              General models are trained on internet-scale text. A finance, spreadsheet, legal, or ops agent needs
              examples of the exact edge cases it fails on in production.
            </p>
            <p>
              Neura converts those failures into expert-authored artifacts, consensus-weighted labels, and immutable
              artifact versions ready for model updates.
            </p>
          </Reveal>

          <Reveal className="landing-bento landing-pipeline-card" delay="short">
            <div className="landing-disconnect-visual" aria-hidden="true">
              <span className="landing-system-node">Agent</span>
              <span className="landing-broken-line" />
              <span className="landing-system-node landing-system-node-muted">Silo</span>
            </div>
            <p>Current agent stacks fail silently because the feedback loop is not an owned product primitive.</p>
          </Reveal>
        </div>

        <Reveal className="landing-table-wrap" delay="medium">
          <div className="landing-comparison-table">
            <div className="landing-table-head">Problem Area</div>
            <div className="landing-table-head">Today</div>
            <div className="landing-table-head">Neura</div>
            {rows.flatMap(([area, today, neura]) => [
              <div key={`${area}-area`}>{area}</div>,
              <div key={`${area}-today`} className="landing-muted-cell">
                {today}
              </div>,
              <div key={`${area}-neura`} className="landing-positive-cell">
                {neura}
              </div>
            ])}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
