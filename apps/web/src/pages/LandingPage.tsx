import { ArchitectureSection } from "../sections/landing/ArchitectureSection";
import { DemoSection } from "../sections/landing/DemoSection";
import { FooterSection } from "../sections/landing/FooterSection";
import { HeroSection } from "../sections/landing/HeroSection";
import { MarketResearchSection } from "../sections/landing/MarketResearchSection";
import { ProblemSection } from "../sections/landing/ProblemSection";
import { RoadmapSection } from "../sections/landing/RoadmapSection";
import { SolutionSection } from "../sections/landing/SolutionSection";

interface LandingPageProps {
  onLaunchApp: () => void;
}

const navigationItems = [
  {
    label: "Problem",
    href: "#problem",
    summary: "Why production agent mistakes need a market for expert correction.",
    meta: "Context"
  },
  {
    label: "Solution",
    href: "#solution",
    summary: "The Neura protocol loop across artifacts, consensus, storage, and buyers.",
    meta: "Protocol"
  },
  {
    label: "Architecture",
    href: "#architecture",
    summary: "Base contracts, storage references, API services, and agent artifact flow.",
    meta: "Stack"
  },
  {
    label: "Demo",
    href: "#demo",
    summary: "Neura shows how corrections become reusable agent improvement material.",
    meta: "Product"
  },
  {
    label: "Market",
    href: "#market",
    summary: "The buyer and contributor case for a decentralized artifact economy.",
    meta: "Demand"
  },
  {
    label: "Roadmap",
    href: "#roadmap",
    summary: "From the current workspace to consensus scoring and buyer SDKs.",
    meta: "Next"
  }
];

export function LandingPage({ onLaunchApp }: LandingPageProps) {
  return (
    <div className="landing-page">
      <div className="landing-noise" aria-hidden="true" />
      <header className="landing-nav">
        <a className="landing-brand" href="#home" aria-label="Neura home">
          <span className="landing-wordmark">Neura</span>
        </a>
        <nav className="landing-navigation-menu" aria-label="Landing sections">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.href}>
                <a className="landing-navigation-trigger" href={item.href}>
                  <span>{item.label}</span>
                </a>
                <div className="landing-navigation-panel" aria-hidden="true">
                  <span>{item.meta}</span>
                  <strong>{item.label}</strong>
                  <p>{item.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </nav>
        <button className="landing-nav-cta landing-hover-button" type="button" onClick={onLaunchApp}>
          <span>Launch App</span>
        </button>
      </header>
      <main>
        <HeroSection onLaunchApp={onLaunchApp} />
        <ProblemSection />
        <SolutionSection onLaunchApp={onLaunchApp} />
        <ArchitectureSection />
        <DemoSection onLaunchApp={onLaunchApp} />
        <MarketResearchSection />
        <RoadmapSection onLaunchApp={onLaunchApp} />
      </main>
      <FooterSection onLaunchApp={onLaunchApp} />
    </div>
  );
}
