import type { ComponentType } from "react";
import { Globe, Plug, Server, Smartphone, Timer } from "lucide-react";

/**
 * The /docs information architecture. One entry per repository. The `badge` is
 * the freshness class that repo's content carries (or will once built) — see
 * FreshnessBadge. `status: "soon"` repos drill into a placeholder until their
 * per-repo panel lands.
 *
 * v1 ships the iOS section (per the iOS-first decision); the other repos are
 * listed so the full-application IA is visible from the docs home.
 */
export type FreshnessClass = "live" | "derived" | "curated" | "mixed";

export interface DocsSection {
  id: string;
  label: string;
  repo: string;
  role: string;
  status: "ready" | "soon";
  badge: FreshnessClass;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "ios",
    label: "iOS app",
    repo: "build.one.ios",
    role: "Offline-first field-worker app · SwiftUI · TestFlight",
    status: "ready",
    badge: "mixed",
    icon: Smartphone,
  },
  {
    id: "api",
    label: "API",
    repo: "build.one.api",
    role: "FastAPI backend — entities, agents, integrations",
    status: "soon",
    badge: "live",
    icon: Server,
  },
  {
    id: "web",
    label: "Web",
    repo: "build.one.web",
    role: "This React app — routes, navigation, components",
    status: "soon",
    badge: "derived",
    icon: Globe,
  },
  {
    id: "mcp",
    label: "MCP server",
    repo: "build.one.mcp",
    role: "HTTP MCP server — tool manifest for Claude clients",
    status: "soon",
    badge: "derived",
    icon: Plug,
  },
  {
    id: "scheduler",
    label: "Scheduler",
    repo: "build.one.scheduler",
    role: "Azure Functions jobs — outbox drain, QBO pulls, reconciles",
    status: "soon",
    badge: "derived",
    icon: Timer,
  },
];

/** Short value-cell word for a freshness class (used in the home list). */
export const FRESHNESS_WORD: Record<FreshnessClass, string> = {
  live: "Live",
  derived: "Derived",
  curated: "Curated",
  mixed: "Derived · Curated",
};

/** Resolve a route param to a section, or undefined if unknown. */
export function findSection(id: string | undefined): DocsSection | undefined {
  return DOCS_SECTIONS.find((s) => s.id === id);
}
