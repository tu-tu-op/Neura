interface FooterSectionProps {
  onLaunchApp: () => void;
}

export function FooterSection({ onLaunchApp }: FooterSectionProps) {
  return (
    <footer className="landing-footer">
      <div className="landing-container landing-footer-inner">
        <div>
          <strong className="landing-wordmark">Neura</strong>
          <p>Decentralized data infrastructure for specialized AI agents.</p>
        </div>
        <button className="landing-hover-button" type="button" onClick={onLaunchApp}>
          <span>Enter Workspace</span>
        </button>
      </div>
    </footer>
  );
}
