import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getList } from "../../api/client";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import type { Project } from "../../types/api";
import { filterProjectsBySearch } from "./projectListFilters";

/**
 * Minimal Project list — entry point to ProjectDetailScreen. Phase 1A
 * keeps this lightweight (name + abbreviation + status, single SectionCard)
 * with client-side name/abbreviation search.
 */
export default function ProjectList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const projectsQ = useQuery<Project[]>({
    queryKey: ["projects-list"],
    queryFn: async () =>
      (await getList<Project>("/api/v1/get/projects")).data,
  });

  const filteredProjects = useMemo(
    () => filterProjectsBySearch(projectsQ.data ?? [], query),
    [projectsQ.data, query],
  );

  const totalCount = projectsQ.data?.length ?? 0;
  const hasActiveQuery = query.trim().length > 0;
  // Only read inside the `projectsQ.data.length > 0` branch below, so a
  // separate `totalCount > 0` guard would be tautological here.
  const showNoMatches = hasActiveQuery && filteredProjects.length === 0;

  const sectionHeader = hasActiveQuery
    ? `${filteredProjects.length} of ${totalCount}`
    : `${totalCount} project${totalCount === 1 ? "" : "s"}`;

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
        <>
          <div className="project-search-bar">
            <input
              type="search"
              className="project-search-input"
              placeholder="Search by name or abbreviation…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              aria-label="Search projects by name or abbreviation"
            />
          </div>

          {showNoMatches ? (
            <div className="page-loading">No matching projects.</div>
          ) : (
            <SectionCard header={sectionHeader}>
              {filteredProjects.map((p) => (
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
        </>
      )}
    </div>
  );
}
