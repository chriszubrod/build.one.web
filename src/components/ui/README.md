# Shared UI (`src/components/ui/`)

In-house primitives for Build One web. Pages and feature components import **these wrappers only** — never `react-aria-components` directly — so behavior, styling, and accessibility stay consistent.

## Adding a component

1. Implement the wrapper here (built on react-aria-components where it fits).
2. Style with tokens in `src/index.css` (`.bo-*` classes).
3. Add `ComponentName.test.tsx` beside the component.
4. Default-import the component from its file (e.g. `components/ui/Combobox.tsx`); there is no barrel export in this folder.

## Conventions

- **Controlled values:** pass `value` + `onChange`. Combobox calls `onChange(nextValue: string)` with the option key or `""` when cleared. Older form fields often use `onChange(name, value)` — do not mix the two shapes on new components.
