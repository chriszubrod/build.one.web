# Session Notes — build.one.web

Chronological session history. Newest at the top.

---

## Session: Multi-repo audit — Web findings (2026-05-20)

Read-only SRE-style audit across all 5 sub-repos. Web findings now in this repo's TODO.md under "Audit 2026-05-20 — Web findings". Full audit memory at `~/.claude/projects/-Users-chris-Applications-build-one/memory/project_audit_2026_05_20.md`.

### Highest-severity web findings
- **HIGH:** `AuthContext.isAuthenticated` + `ProtectedRoute` read localStorage during render → non-reactive on login/logout. Real impact: redirect loops or blank pages after login.
- **HIGH:** JWT in `localStorage` (vs httpOnly cookie) = DOM-XSS exfil target. CSRF cookie is httpOnly, the JWT isn't.
- **HIGH:** Logout clears only `["me"]` from React Query cache → User A's vendor/project caches visible to User B.
- **HIGH:** Bill/Expense/Invoice Complete + Delete handlers all missing `finally { setX(false) }`. Success path leaves the button stuck disabled.
- **HIGH:** Bill Complete doesn't flush auto-save first (Expense does). Auto-save race vs. complete persists.

### Validation
- `tsc --noEmit`: **PASS**.
- `eslint`: 215 errors + 1 warning. 215 are `Unexpected any` (style/type-safety erasure, not bugs). Real flagged items: `usePaginatedList.ts:190` + `useViewAttachmentObjectUrl.ts:19` `setState` in `useEffect` (cascading-render bug); `FolderPicker.tsx:76` `useEffect` missing dep (stale closure).

### Followups expected next session
User prioritized iOS first. Web Tier-1 fixes from the audit:
1. Add `finally { setX(false) }` to every Complete/Delete handler.
2. Make `AuthContext.isAuthenticated` reactive (derive from `username` state).
3. `queryClient.clear()` on logout.
4. Fix `useCompletionPolling` to surface 401/403/500 distinctly from 404.
5. Wrap routes in `<ErrorBoundary>`.
