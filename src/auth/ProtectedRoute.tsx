import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * Guards every authenticated route. When the caller has no token, we bounce
 * them to `/login` and encode the originally-requested path into the
 * `redirect` query param so LoginPage can return them there after sign-in.
 *
 * We pass only `pathname + search + hash` — never the full URL — so a
 * crafted `location.state` or `Location` object can't smuggle an external
 * URL through this hop. LoginPage validates the param again via
 * `safeRedirect()` before navigating, but two layers is better than one.
 */
export default function ProtectedRoute() {
  const token = localStorage.getItem("access_token");
  const location = useLocation();

  if (!token) {
    const next = location.pathname + location.search + location.hash;
    const target =
      next && next !== "/"
        ? `/login?redirect=${encodeURIComponent(next)}`
        : "/login";
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
