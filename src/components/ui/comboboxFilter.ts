export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Split label into word tokens for word-start matching (spaces and common punctuation). */
const WORD_SPLIT_RE = /[\s\-(),/.]+/;

interface PreparedComboboxOptions {
  options: ComboboxOption[];
  /** Parallel to options: normalized label + word tokens. */
  tokens: { lower: string; words: string[] }[];
}

const preparedByOptions = new WeakMap<ComboboxOption[], PreparedComboboxOptions>();

function prepareComboboxOptions(options: ComboboxOption[]): PreparedComboboxOptions {
  const cached = preparedByOptions.get(options);
  if (cached) return cached;
  const prepared: PreparedComboboxOptions = {
    options,
    tokens: options.map((o) => {
      const lower = o.label.toLowerCase();
      return { lower, words: lower.split(WORD_SPLIT_RE).filter(Boolean) };
    }),
  };
  preparedByOptions.set(options, prepared);
  return prepared;
}

function matchRankPrepared(
  tokens: { lower: string; words: string[] },
  qq: string,
  hasQuery: boolean,
): number | null {
  if (!hasQuery) return 0;
  if (tokens.lower.startsWith(qq)) return 0;
  if (tokens.words.some((w) => w.startsWith(qq))) return 1;
  if (tokens.lower.includes(qq)) return 2;
  return null;
}

export interface RankedFilterResult {
  items: ComboboxOption[];
  /** Matches omitted because of maxResults (excluding disabled-only tail). */
  truncatedCount: number;
}

function truncatedCountAfterCap(matchCount: number, maxResults: number): number {
  if (!Number.isFinite(maxResults)) return 0;
  return Math.max(0, matchCount - maxResults);
}

/**
 * Filter and rank options for the combobox list. Empty query returns the first
 * maxResults options in original order.
 */
export function filterRankComboboxOptions(
  options: ComboboxOption[],
  query: string,
  maxResults: number,
): RankedFilterResult {
  const prepared = prepareComboboxOptions(options);
  const q = query.trim();
  const hasQuery = q.length > 0;
  const qq = hasQuery ? q.toLowerCase() : "";

  if (!hasQuery) {
    const items = prepared.options.slice(0, maxResults);
    return {
      items,
      truncatedCount: truncatedCountAfterCap(prepared.options.length, maxResults),
    };
  }

  const ranked: { opt: ComboboxOption; rank: number; index: number }[] = [];
  for (let index = 0; index < prepared.options.length; index++) {
    const opt = prepared.options[index]!;
    const rank = matchRankPrepared(prepared.tokens[index]!, qq, hasQuery);
    if (rank !== null) ranked.push({ opt, rank, index });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const items = ranked.slice(0, maxResults).map((r) => r.opt);
  return { items, truncatedCount: truncatedCountAfterCap(ranked.length, maxResults) };
}
