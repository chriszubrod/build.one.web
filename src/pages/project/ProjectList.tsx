import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getList } from "../../api/client";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import type { Project } from "../../types/api";

/**
 * Minimal Project list — entry point to ProjectDetailScreen. Phase 1A
 * deliberately keeps this lightweight (name + abbreviation + status,
 * single SectionCard). A richer list with filters / search / customer
 * column lands when the full Projects scaffold gets refurbished
 * alongside Vendors + Customers in Phase 1B.
 */
export default function ProjectList() {
  const navigate = useNavigate();

  const projectsQ = useQuery<Project[]>({
    queryKey: ["projects-list"],
    queryFn: async () =>
      (await getList<Project>("/api/v1/get/projects")).data,
  });

  return (
    <div className="ios-page">
      <NavHeader title="Projects" />

      {projectsQ.isLoading && <div className="page-loading">Loading…</div>}

      {projectsQ.isError && (
        <div className="page-loading">Couldn't load projects.</div>
      )}

      {projectsQ.data && projectsQ.data.length === 0 && (
        <div className="page-loading">No projects yet.</div>
      )}

      {projectsQ.data && projectsQ.data.length > 0 && (
        <SectionCard header={`${projectsQ.data.length} project${projectsQ.data.length === 1 ? "" : "s"}`}>
          {projectsQ.data.map((p) => (
            <ListRow
              key={p.public_id}
              title={p.name ?? "(unnamed)"}
              subtitle={p.abbreviation ?? undefined}
              value={p.status ?? undefined}
              onClick={() => navigate(`/project/${p.public_id}`)}
            />
          ))}
        </SectionCard>
      )}
    </div>
  );
}
