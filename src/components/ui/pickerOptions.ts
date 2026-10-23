import type { ComboboxOption } from "./comboboxFilter";

export function vendorComboboxOptions(
  vendors: { public_id: string; name: string }[],
): ComboboxOption[] {
  return vendors.map((v) => ({ value: v.public_id, label: v.name ?? "" }));
}

export function sccOptionLabel(code: {
  number?: string | null;
  name?: string | null;
}): string {
  return code.number ? `${code.number} — ${code.name ?? ""}` : (code.name ?? "");
}

export function sccComboboxOptions(
  codes: { id: number; number?: string | null; name: string }[],
): ComboboxOption[] {
  return codes.map((s) => ({
    value: String(s.id),
    label: sccOptionLabel(s),
  }));
}

export function projectComboboxOptions(
  projects: { public_id: string; abbreviation?: string | null; name: string }[],
): ComboboxOption[] {
  return projects.map((p) => ({
    value: p.public_id,
    label: projectOptionLabel(p.abbreviation, p.name ?? ""),
  }));
}

/** Expense lines store project_id as String(internal id); bills use public_id. */
export function projectComboboxOptionsByInternalId(
  projects: { id: number; abbreviation?: string | null; name?: string | null }[],
): ComboboxOption[] {
  return projects.map((p) => ({
    value: String(p.id),
    label: projectOptionLabel(p.abbreviation, p.name ?? ""),
  }));
}

/** "HP2 — 4406 Harding" style project dropdown label. */
export function projectOptionLabel(
  abbreviation: string | null | undefined,
  name: string,
): string {
  const abbr = (abbreviation ?? "").trim();
  if (!abbr) return name;
  const trimmed = name.trim();
  const next = trimmed.charAt(abbr.length);
  const startsWithAbbr =
    trimmed.toLowerCase().startsWith(abbr.toLowerCase()) &&
    (next === "" || next === " " || next === "-" || next === "—" || next === ":");
  return startsWithAbbr ? name : `${abbr} — ${name}`;
}
