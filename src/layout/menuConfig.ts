import { Clock, HardHat, User } from "lucide-react";
import type { ComponentType } from "react";
import { Modules, type ModuleName } from "../shared/modules";
import type { CurrentUser } from "../types/api";

/**
 * Single source of truth for navigation entries. Both BottomTabBar
 * (mobile/tablet) and AppSidebar (desktop) render from this list.
 *
 * Nav Phase 0 — Today's three active entries (Time / Labor / Profile)
 * live here with section + priority metadata. The drawer/sidebar
 * sections (Financials / Contacts / Admin / Reference / Account) are
 * defined here so Phase 1+ can append entries without restructuring.
 *
 * Each entry maps to a Module — see src/shared/modules.ts. The exception
 * is Profile, which is unconditional (no module required); we use
 * `module: null` to encode that.
 */

export type NavSection = "primary" | "financials" | "contacts" | "admin" | "reference" | "account";

export interface MenuEntry {
  /** Stable identifier — used as map key in primarySlotsForRole. */
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Route the entry navigates to. */
  route: string;
  /**
   * Module name required to see this entry. `null` = unconditional
   * (always visible). System admins bypass module gating per the
   * existing pattern (me.is_admin shortcut).
   */
  module: ModuleName | null;
  /** Permission flag on the module — defaults to "can_read". */
  permission?: "can_read" | "can_create" | "can_update";
  section: NavSection;
  /**
   * Lower = higher priority. Drives ordering inside a section AND tie-
   * breaks when role config doesn't specify the primary slot order.
   */
  priority: number;
  /** If true, requires User.IsSystemAdmin (e.g. Modules / Integrations admin pages). */
  requiresAdmin?: boolean;
}

export const MENU_ENTRIES: MenuEntry[] = [
  {
    id: "time",
    label: "Time",
    icon: Clock,
    route: "/time-entry/list",
    module: Modules.TIME_TRACKING,
    permission: "can_read",
    section: "primary",
    priority: 10,
  },
  {
    id: "labor",
    label: "Labor",
    icon: HardHat,
    route: "/labor/list",
    module: Modules.CONTRACT_LABOR,
    permission: "can_read",
    section: "primary",
    priority: 20,
  },
  {
    id: "profile",
    label: "Profile",
    icon: User,
    route: "/profile",
    module: null, // unconditional
    section: "account",
    priority: 100,
  },
];

/** Lookup by id. Cheap because the list is small; rebuild if it grows past ~30. */
export function findMenuEntry(id: string): MenuEntry | undefined {
  return MENU_ENTRIES.find((e) => e.id === id);
}

/**
 * Returns true if the current user can see this entry.
 * - module === null → always
 * - is_admin === true → bypass module check
 * - requiresAdmin === true → ONLY system admins (used for Modules / Integrations admin)
 * - otherwise → the user has `permission` (default can_read) on the module
 */
export function canSeeEntry(entry: MenuEntry, me: CurrentUser | undefined | null): boolean {
  if (!me) return entry.module === null; // unauth boots only see unconditional entries
  if (entry.requiresAdmin) return !!me.is_admin;
  if (entry.module === null) return true;
  if (me.is_admin) return true;
  const mod = me.modules?.find((m) => m.name === entry.module);
  if (!mod) return false;
  const perm = entry.permission ?? "can_read";
  return !!(mod as unknown as Record<string, boolean>)[perm];
}

/**
 * Curated primary slot mapping per role. The list of ids appears in order
 * left → right on the mobile pill / top → bottom on the desktop sidebar
 * primary tier. Entries the user doesn't have permission to see are
 * filtered out per `canSeeEntry`.
 *
 * Locked 2026-06-17 per Chris's "curated" answer to the nav synthesis.
 * Phase 1+ will extend each role's list as financial entities unpark.
 *
 * Fallback: unknown role + system admin both use DEFAULT_PRIMARY_SLOTS.
 */
const PRIMARY_SLOTS_BY_ROLE: Record<string, string[]> = {
  "Field Crew": ["time", "profile"],
  "Intern": ["time", "profile"],
  "Time Clerk": ["time", "profile"],
  "Project Manager": ["time", "labor", "profile"],
  "Owner": ["time", "labor", "profile"],
  "AP Specialist": ["time", "labor", "profile"],
  "AR Specialist": ["time", "labor", "profile"],
  "Controller": ["time", "labor", "profile"],
  "Reviewer": ["time", "labor", "profile"],
  "Auditor": ["time", "labor", "profile"],
  "Tenant Admin": ["time", "labor", "profile"],
};

/** Fallback primary slots for unknown roles + system admins. */
export const DEFAULT_PRIMARY_SLOTS: string[] = ["time", "labor", "profile"];

/** Hard cap on bottom-pill slots — keeps the iOS/Android ergonomic contract. */
export const MAX_PRIMARY_SLOTS = 5;

/**
 * Resolve the curated primary slots for the current user, filtered to
 * entries they can actually see. System admins fall back to DEFAULT_PRIMARY_SLOTS
 * (they can see everything; we don't curate per-role for them).
 *
 * Returns up to MAX_PRIMARY_SLOTS MenuEntry objects, in order.
 */
export function primarySlotsForUser(me: CurrentUser | undefined | null): MenuEntry[] {
  if (!me) {
    // Unauth case — only profile would be visible, but the gating around
    // BottomTabBar / AppSidebar means we won't render in this state. Return empty.
    return [];
  }
  const roleName = me.role?.name ?? null;
  const ids = (roleName && PRIMARY_SLOTS_BY_ROLE[roleName]) || DEFAULT_PRIMARY_SLOTS;
  const seen = new Set<string>();
  const out: MenuEntry[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const entry = findMenuEntry(id);
    if (!entry) continue;
    if (!canSeeEntry(entry, me)) continue;
    out.push(entry);
    seen.add(id);
    if (out.length >= MAX_PRIMARY_SLOTS) break;
  }
  return out;
}

/**
 * All entries the user can see in a given section, ordered by priority.
 * Used by the More drawer (mobile) and the AppSidebar sections (desktop).
 */
export function entriesInSection(
  section: NavSection,
  me: CurrentUser | undefined | null,
): MenuEntry[] {
  return MENU_ENTRIES.filter((e) => e.section === section && canSeeEntry(e, me)).sort(
    (a, b) => a.priority - b.priority,
  );
}
