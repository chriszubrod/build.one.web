export function fmtMoney(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
