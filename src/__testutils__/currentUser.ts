import type { CurrentUser } from "../types/api";

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
