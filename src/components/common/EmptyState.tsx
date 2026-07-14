import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      {children ? <div className="muted">{children}</div> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
