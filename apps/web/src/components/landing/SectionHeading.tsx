interface SectionHeadingProps {
  kicker: string;
  title: string;
  copy: string;
  align?: "left" | "center";
}

export function SectionHeading({ kicker, title, copy, align = "left" }: SectionHeadingProps) {
  return (
    <header className={`landing-section-heading landing-section-heading-${align}`}>
      <p className="landing-kicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}
