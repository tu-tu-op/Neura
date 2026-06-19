import type { ReactNode } from "react";

interface LandingButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}

export function LandingButton({ children, href, onClick, variant = "secondary" }: LandingButtonProps) {
  const className = `landing-button landing-button-${variant}${variant === "primary" ? " landing-hover-button" : ""}`;

  if (href) {
    return (
      <a className={className} href={href}>
        <span>{children}</span>
      </a>
    );
  }

  return (
    <button className={className} type="button" onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}
