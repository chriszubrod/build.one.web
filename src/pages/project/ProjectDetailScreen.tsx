import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOne } from "../../api/client";
import { fetchBudgetByProject, budgetKeys } from "../../api/budget";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import { BudgetViewContent } from "../budgets/BudgetView";
import type { Project } from "../../types/api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "bills", label: "Bills" },
  { id: "expenses", label: "Expenses" },
  { id: "invoices", label: "Invoices" },
  { id: "labor", label: "Labor" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Project detail page — the "project as hub" pattern locked 2026-06-17.
 * Each tab is a project-scoped slice of an entity surface; the same list
 * components used at the top-level entity routes render here with a
 * project filter pre-applied and the column hidden.
 *
 * Nav Phase 1A — Overview + Budget tabs functional; Bills / Expenses /
 * Invoices / Labor render placeholder cards until the financial
 * surfaces unpark in Phase 2.
 */
export default function ProjectDetailScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const projectQ = useQuery<Project>({
    queryKey: ["project", publicId],
    queryFn: () => getOne<Project>(`/api/v1/get/project/${publicId}`),
    enabled: !!publicId,
  });

  if (!publicId) {
    return (
      <div className="ios-page">
        <NavHeader title="Project" onBack={() => navigate("/project/list")} />
        <div className="page-loading">Missing project id.</div>
      </div>
    );
  }

  if (projectQ.isLoading) {
    return (
      <div className="ios-page">
        <NavHeader title="Project" onBack={() => navigate("/project/list")} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  if (projectQ.isError || !projectQ.data) {
    return (
      <div className="ios-page">
        <NavHeader title="Project" onBack={() => navigate("/project/list")} />
        <div className="page-loading">Project not found.</div>
      </div>
    );
  }

  const project = projectQ.data;

  return (
    <div className="ios-page">
      <NavHeader
        title={project.name ?? "Project"}
        onBack={() => navigate("/project/list")}
      />

      <nav className="project-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`project-tab${activeTab === tab.id ? " project-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="project-tab-body">
        {activeTab === "overview" && <OverviewTab project={project} />}
        {activeTab === "budget" && <BudgetTab projectPublicId={publicId} />}
        {activeTab === "bills" && (
          <PlaceholderTab
            label="Bills"
            message="Bills filtered to this project will appear here once the Bills surface is reactivated (Phase 2)."
          />
        )}
        {activeTab === "expenses" && (
          <PlaceholderTab
            label="Expenses"
            message="Project-scoped Expenses land here in Phase 2."
          />
        )}
        {activeTab === "invoices" && (
          <PlaceholderTab
            label="Invoices"
            message="Project-scoped Invoices land here in Phase 2."
          />
        )}
        {activeTab === "labor" && (
          <PlaceholderTab
            label="Labor"
            message="Project-scoped Contract Labor lands here in Phase 2. The cross-project Labor review screen is at /labor/list."
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: Project }) {
  return (
    <SectionCard header="Project">
      <ListRow title="Name" value={project.name ?? "—"} />
      <ListRow title="Abbreviation" value={project.abbreviation ?? "—"} />
      {project.status && <ListRow title="Status" value={project.status} />}
      {project.description && (
        <ListRow title="Description" value={project.description} />
      )}
      {project.notes && <ListRow title="Notes" value={project.notes} />}
    </SectionCard>
  );
}

function BudgetTab({ projectPublicId }: { projectPublicId: string }) {
  const budgetQ = useQuery({
    queryKey: budgetKeys.byProject(projectPublicId),
    queryFn: () => fetchBudgetByProject(projectPublicId),
    enabled: !!projectPublicId,
  });

  if (budgetQ.isLoading) {
    return <div className="page-loading">Loading budget…</div>;
  }

  if (budgetQ.isError) {
    return (
      <div className="page-loading">
        Couldn't load the project budget.
      </div>
    );
  }

  const budget = budgetQ.data;

  if (!budget) {
    return (
      <SectionCard
        header="Budget"
        footer="A budget for this project hasn't been created yet."
      >
        <ListRow
          title="Create budget for this project"
          to={`/budget/create?project_public_id=${projectPublicId}`}
        />
      </SectionCard>
    );
  }

  return <BudgetViewContent publicId={budget.public_id} />;
}

function PlaceholderTab({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  return (
    <SectionCard header={label} footer={message}>
      <div style={{ padding: "var(--space-md)", color: "var(--color-text-muted)" }}>
        Coming soon.
      </div>
    </SectionCard>
  );
}
