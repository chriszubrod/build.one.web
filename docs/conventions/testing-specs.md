# Writing component specs that can actually fail (U-152)

A spec that passes whether or not the code works is worse than no spec. Three rules, all enforced by `src/__testutils__/`.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

## Writing component specs that can actually fail (U-152)

A spec that passes whether or not the code works is worse than no spec — it
reads as coverage. The `does not clobber in-progress edits` spec shipped
**four times** by copy-paste before anyone checked it could fail. Three rules,
all enforced by `src/__testutils__/`:

1. **Type through the value tracker.** `input.value = x` also updates React's
   internal `_valueTracker`, so React sees no change and **suppresses
   `onChange`** — the text lands in the DOM but never in component state. A
   later `expect(input.value)` then reads back the test's own write. Use
   `setInputValue` from `src/__testutils__/domEvents.ts`.
2. **Flush with timers, not microtasks.** Under `vi.useFakeTimers()`, a React
   Query refetch needs a timer tick before React re-renders; `await
   Promise.resolve()` xN never delivers it, so the spec asserts against the
   stale render. Use `flushUntil` from `src/__testutils__/flush.ts`, and always
   follow it with a hard assertion — it returns silently on exhaustion.
3. **Assert propagation BEFORE asserting the outcome.** If the spec depends on
   fresh server data reaching the component, prove it did (see `RefetchWitness`
   in `formSeedGuardHarness.ts`) — otherwise "nothing changed" passes for the
   wrong reason. Fixture preconditions belong in `expect`s, not comments.

**Mutation-test anything guard-shaped before you trust it:** break the guard,
confirm the spec goes RED, restore. `assertGuardSurvivesSameRowRefetch` is the
worked example — reuse it when unparking an Edit page rather than copying a
spec body.

