import type { ReactNode } from "react";

interface SectionCardProps {
  /** Header content. `string` is rendered as plain text; ReactNode allows
   *  custom inline elements (e.g. a trailing icon button). */
  header?: ReactNode;
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
