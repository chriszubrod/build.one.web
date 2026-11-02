import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

/**
 * The Search / From / To / Clear filter bar shared by the Bills, Expenses and
 * Labor list pages (U-752). Extracted from three hand-written copies of the
 * same `list-filter-*` markup.
 *
 * Search is DEBOUNCED here so every page gets it (Bills used to do this
 * in-page; Expenses and Labor fired a request / URL write per keystroke). The
 * input is controlled by LOCAL state so typing stays responsive; the parent's
 * `onSearchChange` fires once typing pauses for `debounceMs`. When the parent's
 * `search` changes for any other reason (Clear, a URL change, a restored
 * session) the local input follows it.
 *
 * Pending (typed, not yet committed) text is flushed at once on Enter, on
 * blur, and on unmount — so clicking a row within the debounce window does not
 * lose the term (U-752 fix round 1). `reason` tells the parent which; a parent
 * whose write is a NAVIGATION (URL-backed search) must ignore "unmount", since
 * by then the router has already moved on — see LaborList.
 *
 * The date inputs are not debounced — a date picker commits a whole value.
 */
export type SearchCommitReason = "debounce" | "enter" | "blur" | "unmount";

export interface ListFilterBarProps {
  /** The committed (parent-owned) search term. */
  search: string;
  /** Called once typing pauses (or on Enter / blur / unmount) — never per keystroke. */
  onSearchChange: (value: string, reason: SearchCommitReason) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  /** `"Bill date"` → aria-labels "Bill date from" / "Bill date to". */
  dateAriaLabelPrefix: string;
  /** Whether a committed filter is active (enables Clear). */
  hasActiveFilters: boolean;
  /**
   * Clears every filter. The local search input is cleared here too. NOT
   * called when the only thing to clear is uncommitted typed text — that is
   * cleared locally, so pagination and the URL are left alone.
   */
  onClear: () => void;
  /** Extra controls rendered in the row, before the Clear button. */
  children?: ReactNode;
  debounceMs?: number;
}

export default function ListFilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  dateAriaLabelPrefix,
  hasActiveFilters,
  onClear,
  children,
  debounceMs = 300,
}: ListFilterBarProps) {
  const [input, setInput] = useState(search);
  const debounced = useDebouncedValue(input, debounceMs);
  /** The `search` prop as of the last effect pass — detects external changes. */
  const prevSearchRef = useRef(search);
  /** The last value we emitted or adopted — never re-emit it. */
  const lastCommittedRef = useRef(search);
  /** Mirrors `input` for the unmount flush (a cleanup cannot read state). */
  const inputRef = useRef(search);
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  /** Commit whatever is typed now, unless it is already the committed term. */
  const flush = (reason: SearchCommitReason) => {
    const pending = inputRef.current;
    if (pending === lastCommittedRef.current) return;
    lastCommittedRef.current = pending;
    onSearchChangeRef.current(pending, reason);
  };

  // Set in the LAYOUT cleanup, which runs in the mutation phase BEFORE the
  // host input is removed. Chrome fires blur when a focused input is removed,
  // and React can still dispatch onBlur during that deletion commit; without
  // this flag it would reach the parent as a "blur" commit, and a URL-backed
  // parent (LaborList) would navigate back to its own page. Reset in the body
  // so StrictMode's simulated unmount/remount leaves it false.
  const unmountingRef = useRef(false);
  useLayoutEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
    };
  }, []);

  // Unmount flush. Re-emit-safe by construction: Clear and an external
  // adoption both set inputRef AND lastCommittedRef, so they compare equal
  // here. StrictMode's simulated unmount runs this at mount, when nothing is
  // pending; and any emit updates lastCommittedRef, so the remount cannot
  // emit the same value twice.
  useEffect(
    () => () => {
      const pending = inputRef.current;
      if (pending === lastCommittedRef.current) return;
      lastCommittedRef.current = pending;
      onSearchChangeRef.current(pending, "unmount");
    },
    [],
  );

  // ONE effect, so an external reset and a settling debounce can never be
  // processed in the wrong order within a single commit: an external change
  // is adopted first and suppresses the emit for that pass. Otherwise a
  // stale debounced "abc" could be emitted right after Clear set "" (the
  // U-700 F1 race BillList.search.test.tsx pins).
  useEffect(() => {
    if (search !== prevSearchRef.current) {
      prevSearchRef.current = search;
      // Our own emit echoing back is not external; adopting it would clobber
      // anything typed since.
      //
      // ASSUMPTION: parents echo an emit synchronously (setState / setSearchParams
      // in the handler), so the echo arrives before any newer emit. A parent
      // that echoed ASYNCHRONOUSLY, after a newer emit, would have that stale
      // echo adopted here as an external change and the input reset to it.
      if (search !== lastCommittedRef.current) {
        lastCommittedRef.current = search;
        inputRef.current = search;
        // Telling an external change from our own echo needs lastCommittedRef,
        // which may only be read in an effect — so the adoption happens here.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of an external search value
        setInput(search);
        return;
      }
    }
    if (debounced !== input) return; // still typing
    if (debounced === lastCommittedRef.current) return;
    lastCommittedRef.current = debounced;
    // Through the ref (synced by the effect above, which runs first in the
    // same commit) so pages' inline callbacks don't re-run this every render.
    onSearchChangeRef.current(debounced, "debounce");
  }, [search, debounced, input]);

  const clear = () => {
    setInput("");
    inputRef.current = "";
    // Only uncommitted text to clear: do it locally and leave the parent's
    // pagination / URL alone.
    if (!hasActiveFilters) return;
    lastCommittedRef.current = "";
    onClear();
  };

  return (
    <div className="list-filter-bar">
      <div className="list-filter-row">
        <label className="list-filter-field list-filter-field-grow">
          <span className="list-filter-label">Search</span>
          <input
            type="search"
            className="list-filter-input"
            placeholder={searchPlaceholder}
            value={input}
            onChange={(e) => {
              inputRef.current = e.target.value;
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") flush("enter");
            }}
            onBlur={() => flush(unmountingRef.current ? "unmount" : "blur")}
            autoComplete="off"
            aria-label={searchAriaLabel}
          />
        </label>
        <label className="list-filter-field">
          <span className="list-filter-label">From</span>
          <input
            type="date"
            className="list-filter-input"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            aria-label={`${dateAriaLabelPrefix} from`}
          />
        </label>
        <label className="list-filter-field">
          <span className="list-filter-label">To</span>
          <input
            type="date"
            className="list-filter-input"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            aria-label={`${dateAriaLabelPrefix} to`}
          />
        </label>
        {children}
        <button
          type="button"
          className="list-filter-clear"
          onClick={clear}
          // Keep focus in the search input: a mouse-down blur would commit the
          // pending text (fetch, page reset, ?q=) before this click runs and
          // defeat the uncommitted-only Clear path. Tab-to-Clear still flushes.
          onMouseDown={(e) => e.preventDefault()}
          // Typed-but-not-yet-committed text counts too: Clear must not sit
          // disabled for the debounce window after the user starts typing.
          disabled={!hasActiveFilters && input === ""}
          aria-label="Clear all filters"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
