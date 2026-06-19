import type { PropsWithChildren, ReactNode } from "react";

interface PanelProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function Panel({ title, eyebrow, action, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          {eyebrow ? <p className="panel-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
