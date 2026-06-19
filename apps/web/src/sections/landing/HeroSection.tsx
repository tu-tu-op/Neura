import { LandingButton } from "../../components/landing/LandingButton";
import { Reveal } from "../../components/landing/Reveal";
import { SplitText } from "../../components/landing/SplitText";

interface HeroSectionProps {
  onLaunchApp: () => void;
}

const orbitNodes = ["Sui", "Walrus Storage", "Move Packages", "Agent ID"];

export function HeroSection({ onLaunchApp }: HeroSectionProps) {
  return (
    <section className="landing-hero landing-neural-grid" id="home">
      <div className="landing-container landing-hero-grid">
        <Reveal className="landing-hero-copy">
          <p className="landing-kicker">Artifact Economy for AI Agents</p>
          <SplitText text="Install agent knowledge, one artifact at a time." />
          <p>
            Neura turns expert corrections into versioned, on-chain artifacts that AI developers can add to agent
            libraries after they ship.
          </p>
          <div className="landing-action-row">
            <LandingButton variant="primary" onClick={onLaunchApp}>
              Launch App
            </LandingButton>
            <LandingButton href="#demo">Explore Platform</LandingButton>
            <LandingButton href="#architecture" variant="ghost">
              View Architecture
            </LandingButton>
          </div>
          <div className="landing-hero-metrics" aria-label="Neura platform signals">
            <span>Artifact marketplace</span>
            <span>Expert consensus</span>
            <span>Walrus storage proofs</span>
          </div>
        </Reveal>

        <Reveal className="landing-hero-visual" delay="short">
          <div className="landing-orbit-card" aria-label="Neura infrastructure loop">
            <div className="landing-orbit-core">
              <strong>Neura</strong>
            </div>
            {orbitNodes.map((node, index) => (
              <span className={`landing-orbit-node landing-orbit-node-${index + 1}`} key={node}>
                {node}
              </span>
            ))}
            <div className="landing-visual-console">
              <span>artifact.excel.installed</span>
              <span>consensus.weight: 0.87</span>
              <span>storage.root: 0x4a3f...91c2</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
