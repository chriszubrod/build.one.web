/**
 * RBAC module name constants — web mirror of build.one.api/shared/rbac_constants.py.
 *
 * These MUST match the `Name` column in `dbo.[Module]` exactly. Use them
 * everywhere the web checks `me.modules.find((m) => m.name === ...)`
 * instead of inline string literals — a typo on a literal silently hides
 * a nav entry, while a typo on a constant fails compilation.
 *
 * Keep in lockstep with the API constants file; add new modules here
 * when they're added server-side.
 */
export const Modules = {
  // Financial entities
  BILLS: "Bills",
  BILL_CREDITS: "Bill Credits",
  BUDGETS: "Budgets",
  EXPENSES: "Expenses",
  INVOICES: "Invoices",
  CONTRACT_LABOR: "Contract Labor",
  EMPLOYEE_LABOR: "Employee Labor",

  // Reference data
  VENDORS: "Vendors",
  CUSTOMERS: "Customers",
  PROJECTS: "Projects",
  COST_CODES: "Cost Codes",

  ATTACHMENTS: "Attachments",

  // Admin
  USERS: "Users",
  ROLES: "Roles",
  EMPLOYEES: "Employees",
  ORGANIZATIONS: "Organizations",
  COMPANIES: "Companies",

  INTEGRATIONS: "Integrations",
  QBO_SYNC: "QBO Sync",

  DASHBOARD: "Dashboard",

  REVIEW_STATUSES: "Review Statuses",
  TASKS: "Tasks",

  // Time tracking
  TIME_TRACKING: "Time Tracking",

  // Email-agent pipeline
  EMAIL_MESSAGES: "Email Messages",
} as const;

export type ModuleName = (typeof Modules)[keyof typeof Modules];
