import type { CurrentUser, CurrentUserModule } from "../types/api";

/**
 * Minimal CurrentUser fake for pages that only branch on `is_admin`
 * (the admin surface, /docs). Every other field is the empty/neutral value so
 * a test that starts caring about one has to say so explicitly.
 */
export function makeUser(isAdmin: boolean): CurrentUser {
  return {
    is_admin: isAdmin,
    modules: [],
    auth: { public_id: "a", username: "tester" },
    user: { id: 1, public_id: "u", firstname: "T", lastname: "E" },
    role: null,
    accessible_project_ids: [],
  };
}

export function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  };
}

export function makeUserWithModules(modules: CurrentUserModule[]): CurrentUser {
  return {
    is_admin: false,
    modules,
    auth: { public_id: "a", username: "user" },
    user: { id: 1, public_id: "u", firstname: "T", lastname: "E" },
    role: null,
    accessible_project_ids: [],
  };
}
