## Offline-first sync & multi-user safety

Two properties define the iOS app and shape almost every service: it must work
**offline**, and it must be safe on a **shared device**.

### Local-first sync

Services never block the UI on the network. The pattern (reference
implementation: `UserService`) is:

1. **Write locally first** — save to CoreData immediately and update in-memory
   `@Observable` state optimistically.
2. **Sync asynchronously** — call `syncPendingUpdate()` after the local write;
   it guards on `isConnected` and `isSaving`.
3. **Retry on reconnect** — `observeConnectivity()` (via `withObservationTracking`
   on `NetworkMonitor.isConnected`) re-runs the sync when the network returns.
4. **Resolve conflicts** — on a `409`, the response body is decoded back into
   the entity type and surfaced as `pendingConflict: ConflictResolution<T>?`;
   the view presents a resolution alert so the user chooses.
5. **Re-hydrate on load** — `loadEntity()` re-populates from CoreData if
   in-memory state is nil, so there is no flash after a logout/re-login.

Pending writes are tracked with CoreData flags (`hasPendingCreate/Update/Delete`)
and shadow fields, so a queued edit survives an app kill and drains later.

### Multi-user shared-device safety

A field iPhone may have several workers sign in and out across one shift. The
non-negotiable contract: **one worker must never see, or resume the edits of,
another.**

- **Per-user CoreData scoping.** Every per-user entity carries a `userId`
  attribute. Each cache read filters with `NSPredicate(format: "userId == %@", ...)`.
  Of the app's CoreData entities, the user-scoped ones include `CDTimeEntry`,
  `CDTimeLog`, `CDProject`, `CDContact`, `CDModule`, `CDUserRole`, and more —
  see the live count in the facts panel above.
- **Do _not_ delete rows on logout.** `resetForLogout()` clears in-memory
  `@Observable` state only. Deleting CoreData rows would destroy a worker's
  offline-queued edits on a session-expiry logout. The queue must survive.
- **Generation tokens.** A generation counter is bumped on logout; in-flight
  network responses are discarded if their generation no longer matches,
  preventing a prior user's data from resuming on the next user's screen after
  an actor hop.
- **Biometric reset.** `BiometricService.resetForLogout()` clears the
  biometric credential slot so the next worker cannot Face-ID-login as the
  previous one on a shared device.
- **`CDModule` is per-user too.** `/get/modules/user/{id}` returns the *current*
  user's accessible modules (resolved through UserRole → Role → RoleModule), so
  the RBAC gate cannot be seeded by a prior worker's grants.

### The mandatory smoke test

> Single-developer, single-account testing hides the entire class of
> state-bleed bugs that shipped in v0.1.0. **Before any TestFlight upload that
> touches per-user data:** sign in as User A → populate state (clock in, edit
> logs, queue offline mutations) → sign out → sign in as User B with a
> *different role* → verify User B sees only their own data, only their
> RBAC-scoped modules, and (on a clean install) the onboarding carousel.
