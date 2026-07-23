import { BookOpen, Briefcase, Calculator, CircleDollarSign, ClipboardCheck, Clock, FileMinus, FileText, HardHat, Receipt, ShieldCheck, Store, Tags, User, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Modules, type ModuleName } from "../shared/modules";
import { hasModulePermission } from "../shared/permissions";
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
    id: "projects",
    label: "Projects",
    icon: Briefcase,
    route: "/project/list",
    module: Modules.PROJECTS,
    permission: "can_read",
    section: "financials",
    priority: 30,
  },
  {
    id: "budgets",
    label: "Budgets",
    icon: Calculator,
    route: "/budget/list",
    module: Modules.BUDGETS,
    permission: "can_read",
    section: "financials",
    priority: 35,
  },
  {
    id: "bills",
    label: "Bills",
    icon: FileText,
    route: "/bill/list",
    module: Modules.BILLS,
    permission: "can_read",
    section: "financials",
    priority: 40,
  },
  {
    id: "bill-credits",
    label: "Bill Credits",
    icon: FileMinus,
    route: "/bill-credit/list",
    module: Modules.BILL_CREDITS,
    permission: "can_read",
    section: "financials",
    priority: 42,
  },
  {
    id: "expenses",
    label: "Expenses",
    icon: Receipt,
    route: "/expense/list",
    module: Modules.EXPENSES,
    permission: "can_read",
    section: "financials",
    priority: 45,
  },
  {
    id: "expense-coding",
    label: "Expense Coding",
    icon: ClipboardCheck,
    route: "/expense-coding",
    module: Modules.EXPENSES,
    permission: "can_read",
    section: "financials",
    priority: 46,
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: CircleDollarSign,
    route: "/invoice/list",
    module: Modules.INVOICES,
    permission: "can_read",
    section: "financials",
    priority: 47,
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: Store,
    route: "/vendor/list",
    module: Modules.VENDORS,
    permission: "can_read",
    section: "contacts",
    priority: 50,
  },
  {
    id: "vendor-types",
    label: "Vendor Types",
    icon: Tags,
    route: "/vendor-type/list",
    module: Modules.VENDORS,
    permission: "can_read",
    section: "contacts",
    priority: 52,
  },
  {
    id: "vendor-compliance",
    label: "Compliance",
    icon: ShieldCheck,
    route: "/vendor-compliance",
    module: Modules.VENDORS,
    permission: "can_read",
    section: "contacts",
    priority: 55,
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    route: "/customer/list",
    module: Modules.CUSTOMERS,
    permission: "can_read",
    section: "contacts",
    priority: 60,
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
  {
    id: "docs",
    label: "Docs",
    icon: BookOpen,
    route: "/docs",
    module: null, // no module — gated by requiresAdmin below
    section: "reference",
    priority: 200,
    requiresAdmin: true, // system admins only
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
  if (entry.requiresAdmin) return !!me?.is_admin; // admin entries: never on unauth boots
  if (!me) return entry.module === null; // unauth boots only see unconditional entries
  if (entry.module === null) return true;
  return hasModulePermission(me, entry.module, entry.permission ?? "can_read");
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
 *
 * Mobile pill shows these slots PLUS a More slot whenever secondary sections
 * exist, so curated lists must stay ≤4 to keep the pill at MAX_PRIMARY_SLOTS total.
 */
export const PRIMARY_SLOTS_BY_ROLE: Record<string, string[]> = {
  "Field Crew": ["time", "profile"],
  "Intern": ["time", "profile"],
  "Time Clerk": ["time", "profile"],
  "Project Manager": ["time", "labor", "projects", "profile"],
  "Owner": ["time", "labor", "projects", "profile"],
  "AP Specialist": ["time", "labor", "bills", "profile"],
  "AR Specialist": ["time", "labor", "projects", "profile"],
  "Controller": ["time", "labor", "bills", "profile"],
  "Reviewer": ["time", "labor", "projects", "profile"],
  "Auditor": ["time", "labor", "projects", "profile"],
  "Tenant Admin": ["time", "labor", "projects", "profile"],
};

/**
 * Fallback primary slots for unknown roles + system admins. Admin tools like
 * Docs are NOT here — they live in their section (e.g. "reference") and are
 * rendered by AppSidebar's secondary-section list, keeping the primary pill at
 * its ergonomic ≤5 cap and off the field-worker bottom tab bar.
 */
export const DEFAULT_PRIMARY_SLOTS: string[] = ["time", "labor", "projects", "profile"];

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
 * RBAC-gated building block that `secondarySectionsForUser` composes into
 * drawer and sidebar section lists.
 */
export function entriesInSection(
  section: NavSection,
  me: CurrentUser | undefined | null,
): MenuEntry[] {
  return MENU_ENTRIES.filter((e) => e.section === section && canSeeEntry(e, me)).sort(
    (a, b) => a.priority - b.priority,
  );
}

export interface SecondarySection {
  section: NavSection;
  label: string;
  entries: MenuEntry[];
}

/** Display order + labels for non-primary nav sections (drawer + sidebar). */
export const SECONDARY_SECTION_SPECS: Omit<SecondarySection, "entries">[] = [
  { section: "financials", label: "Financials" },
  { section: "contacts", label: "Contacts" },
  { section: "admin", label: "Admin" },
  { section: "reference", label: "Reference" },
  { section: "account", label: "Account" },
];

/**
 * Single source of truth for "what is NOT on the primary nav for this user".
 * Consumed by both MoreDrawer (mobile bottom sheet) and AppSidebar (desktop).
 *
 * Builds each non-primary section via `entriesInSection` (RBAC/module gating),
 * then drops any entry already shown in `primarySlotsForUser` so profile,
 * projects, etc. never double-list. Sections with zero surviving entries are
 * omitted. Returns [] when `me` is null/undefined.
 */
export function secondarySectionsForUser(
  me: CurrentUser | undefined | null,
): SecondarySection[] {
  if (!me) return [];
  const primaryIds = new Set(primarySlotsForUser(me).map((e) => e.id));
  return SECONDARY_SECTION_SPECS.map(({ section, label }) => ({
    section,
    label,
    entries: entriesInSection(section, me).filter((e) => !primaryIds.has(e.id)),
  })).filter((s) => s.entries.length > 0);
}

/** True when `pathname` is the entry's own route or a child of it (e.g. /vendor/list owns /vendor/456). */
export function isEntryRouteActive(entry: MenuEntry, pathname: string): boolean {
  const base = "/" + entry.route.split("/")[1];
  return pathname === base || pathname.startsWith(base + "/");
}
