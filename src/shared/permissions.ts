import type { CurrentUser, CurrentUserModule } from "../types/api";
import type { ModuleName } from "./modules";

/**
 * Boolean permission flags on a module row in the `/me` payload.
 * Derived from `CurrentUserModule` so new `can_*` API fields widen this type automatically.
 */
export type ModulePermission = {
  [K in keyof CurrentUserModule]: CurrentUserModule[K] extends boolean ? K : never;
}[keyof CurrentUserModule];

/**
 * Single client-side mirror of `require_module_api(module, permission)` in build.one.api.
 * System admins bypass the module check server-side, so they bypass here too.
 * A user with no row for the module has no permission on it.
 */
export function hasModulePermission(
  me: CurrentUser | undefined | null,
  module: ModuleName,
  permission: ModulePermission,
): boolean {
  if (!me) return false;
  if (me.is_admin) return true;
  const mod = me.modules?.find((m) => m.name === module);
  if (!mod) return false;
  return !!mod[permission];
}
