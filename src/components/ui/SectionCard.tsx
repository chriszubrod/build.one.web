import type { ReactNode } from "react";

interface SectionCardProps {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export default function SectionCard({ header, footer, children }: SectionCardProps) {
  return (
    <section className="section-card-wrap">
      {header && <div className="section-card-header">{header}</div>}
      <div className="section-card">{children}</div>
      {footer && <div className="section-card-footer">{footer}</div>}
    </section>
  );
}
