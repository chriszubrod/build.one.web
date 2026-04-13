import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  count?: number;
  createPath?: string;
  createLabel?: string;
  children?: React.ReactNode;
}

export default function PageHeader({
  title,
  count,
  createPath,
  createLabel = "Create",
  children,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="page-header">
      <h1>{title}</h1>
      {count !== undefined && <span className="page-count">{count} total</span>}
      <div className="page-header-spacer" />
      {children}
      {createPath && (
        <button
          className="btn btn-primary"
          onClick={() => navigate(createPath)}
        >
          {createLabel}
        </button>
      )}
    </div>
  );
}
