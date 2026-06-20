## Architecture

The Build.One iOS app is a **field-worker tool** — built offline-first for
construction crews on jobsite cellular, where the network is intermittent and a
single iPhone may be shared across a shift.

### Stack & shape

- **SwiftUI + MVVM** with the **Observation framework** (`@Observable`) — not
  Combine's `ObservableObject`/`@Published`.
- **Zero third-party dependencies.** No SPM packages, no CocoaPods. Everything
  is first-party Apple frameworks (SwiftUI, CoreData, Keychain, LocalAuthentication).
- **Single dependency-injection container** — `AppEnvironment` (an `@Observable`
  created once in `BuildOneApp`) holds every service and view model and is
  injected into the view tree via `.environment(appEnv)`.

### Layers

| Layer | Owns | Examples |
|-------|------|----------|
| **Views** (SwiftUI) | Layout only; read `AppEnvironment` via `@Environment` | `TodayScreen`, `ProfileView` |
| **ViewModels** (`@MainActor @Observable`) | Transient UI state (edit fields), forward service state via computed properties | `TimeTrackingViewModel` |
| **Services** (`@MainActor @Observable`) | Shared domain state **and** API calls | `UserService`, `TimeEntryService` |
| **Infrastructure** | Networking, persistence, device | `APIClient`, `CoreDataStack`, `KeychainService`, `NetworkMonitor` |

The split is deliberate: **services own state and talk to the network; view
models are thin UI layers over services.** A view never constructs a service or
a view model — `AppEnvironment` does, once.

### Networking

All network access goes through an **actor-isolated `APIClient`** and
`AuthenticatedSession` — never raw `URLSession` from a service or view model.
`AuthenticatedSession` handles Bearer-token injection, **pre-emptive refresh**,
and **401 retry-once** automatically. Each endpoint is a value conforming to the
`APIEndpoint` protocol (path, method, body, response type); feature endpoints
live alongside their feature, shared ones under `Services/`.

Errors flow through a single pipeline: `AppError` → `ResultHandler` → a toast or
a critical alert. Tokens live in the **Keychain**; non-sensitive metadata
(username, tenant id) lives in `UserDefaults` via `TokenStore`.

> **Why MVVM + Observation over Redux/Combine?** The app's state is naturally
> per-entity and owned by services; Observation gives fine-grained,
> low-ceremony reactivity without the boilerplate of `@Published` or the
> indirection of a global store. For a small, offline-first app this keeps the
> data flow easy to follow and easy to test at the service/view-model seam.
