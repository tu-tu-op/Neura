import { Reveal } from "../../components/landing/Reveal";
import { SectionHeading } from "../../components/landing/SectionHeading";

const marketCards = [
  {
    metric: "Specialized agents",
    title: "Narrow agents need narrow artifacts",
    copy: "Spreadsheet, contract, CRM, analytics, and support agents all need domain-correct examples that generic model data does not provide."
  },
  {
    metric: "Expert labor",
    title: "Knowledge work is the supply side",
    copy: "The highest-value labels come from operators who understand why an output is wrong and how it should be corrected."
  },
  {
    metric: "Reusable artifacts",
    title: "Corrections become assets",
    copy: "Neura treats repeated answer patterns as reusable artifacts that can be installed into agent libraries."
  }
];

export function MarketResearchSection() {
  return (
    <section className="landing-section" id="market">
      <div className="landing-container">
        <Reveal>
          <SectionHeading
            align="center"
            kicker="Market Research"
            title="The next AI moat is verified artifact context"
            copy="Model quality is increasingly constrained by workflow-specific artifacts, not just larger base models. Neura positions those artifacts as liquid, inspectable infrastructure."
          />
        </Reveal>
        <div className="landing-market-grid">
          {marketCards.map((card, index) => (
            <Reveal className="landing-market-card" delay={index === 0 ? "none" : index === 1 ? "short" : "medium"} key={card.title}>
              <span>{card.metric}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
