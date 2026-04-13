import { useNavigate } from "react-router-dom";
import Breadcrumb, { type Crumb } from "./Breadcrumb";

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

interface DetailViewProps {
  title: string;
  fields: DetailField[];
  editPath: string;
  onDelete?: () => void;
  deleting?: boolean;
  children?: React.ReactNode;
  breadcrumbs?: Crumb[];
}

export default function DetailView({
  title,
  fields,
  editPath,
  onDelete,
  deleting = false,
  children,
  breadcrumbs,
}: DetailViewProps) {
  const navigate = useNavigate();

  return (
    <div className="page">
      {breadcrumbs && <Breadcrumb crumbs={breadcrumbs} />}
      <div className="page-header">
        <h1>{title}</h1>
        <div className="page-header-spacer" />
        <button className="btn btn-secondary" onClick={() => navigate(editPath)}>
          Edit
        </button>
        {onDelete && (
          <button
            className="btn btn-danger"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>

      <div className="detail-card">
        <dl className="detail-fields">
          {fields.map((f) => (
            <div key={f.label} className="detail-row">
              <dt>{f.label}</dt>
              <dd>{f.value ?? <span className="text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
        {children}
      </div>
    </div>
  );
}
