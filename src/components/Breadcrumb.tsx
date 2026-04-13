import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  crumbs: Crumb[];
}

export default function Breadcrumb({ crumbs }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          {crumb.path ? (
            <Link to={crumb.path} className="breadcrumb-link">{crumb.label}</Link>
          ) : (
            <span className="breadcrumb-current">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Build standard breadcrumbs for an entity page.
 * entityLabel: "Vendors", entityListPath: "/vendor/list"
 * currentLabel: "Acme Corp" or "Edit" or "Create"
 */
export function entityCrumbs(
  entityLabel: string,
  entityListPath: string,
  currentLabel?: string,
): Crumb[] {
  const crumbs: Crumb[] = [
    { label: entityLabel, path: entityListPath },
  ];
  if (currentLabel) {
    crumbs.push({ label: currentLabel });
  }
  return crumbs;
}
