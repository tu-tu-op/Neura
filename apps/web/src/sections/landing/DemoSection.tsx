import { LandingButton } from "../../components/landing/LandingButton";
import { Reveal } from "../../components/landing/Reveal";
import { SectionHeading } from "../../components/landing/SectionHeading";

interface DemoSectionProps {
  onLaunchApp: () => void;
}

export function DemoSection({ onLaunchApp }: DemoSectionProps) {
  return (
    <section className="landing-section landing-section-band" id="demo">
      <div className="landing-container">
        <Reveal>
          <SectionHeading
            kicker="Product Demo"
            title="Neura shows the loop end to end"
            copy="The existing Neura dashboard already includes an agent artifact workspace. The landing page now points users directly into that product surface."
          />
        </Reveal>

        <div className="landing-demo-grid">
          <Reveal className="landing-terminal landing-terminal-baseline">
            <div className="landing-terminal-top">
              <span>Terminal: Neura v1.0</span>
              <strong>Baseline</strong>
            </div>
            <div className="landing-terminal-body">
              <p>System &gt; Loading financial_q3.xlsx... Done.</p>
              <p>User &gt; Total recurring revenue across enterprise tiers?</p>
              <div className="landing-terminal-output landing-terminal-error">
                I cannot determine the total recurring revenue. The workbook contains multiple sheets and ambiguous
                labels.
              </div>
              <p>Failure matched. Searching Neura artifacts...</p>
            </div>
          </Reveal>

          <Reveal className="landing-terminal landing-terminal-tuned" delay="short">
            <div className="landing-terminal-top">
              <span>Terminal: Neura v2.1</span>
              <strong>Fine-tuned</strong>
            </div>
            <div className="landing-terminal-body">
              <p>&gt; Fetched ArtifactNFT 0x8f...2a1</p>
              <p>&gt; Applied curated artifact context</p>
              <div className="landing-terminal-output landing-terminal-success">
                Based on Sheet2 and filtering by Recurring status, total enterprise revenue is $4.2M.
              </div>
              <p>Correct inference. Agent improved.</p>
            </div>
          </Reveal>
        </div>

        <Reveal className="landing-demo-cta">
          <LandingButton variant="primary" onClick={onLaunchApp}>
            Open Platform
          </LandingButton>
          <p>Launches the agent and artifact workspace with the current functionality intact.</p>
        </Reveal>
      </div>
    </section>
  );
}
