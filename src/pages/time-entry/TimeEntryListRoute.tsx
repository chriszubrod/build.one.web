import { useEffect, useState } from "react";
import TodayScreen from "./TodayScreen";
import TimeEntryList from "./TimeEntryList";

// Viewport gate at `/time-entry/list`:
//   < 768w  → TodayScreen  (phone-first: hero clock-in + DayStrip + today cards)
//   ≥ 768w  → TimeEntryList (tablet/laptop/desktop table: filters, chips, sort)
//
// Same URL, different layouts. Mobile field workers get the today-first shell
// they already know; office on iPad/laptop/desktop gets the multi-day scan
// table with status chips, date presets, and sortable columns.
//
// Reactive on resize (rotate iPad, drag a desktop window past 768) via
// matchMedia's change event. Guards SSR-ish first render where matchMedia
// may not exist.
const TABLET_UP = "(min-width: 768px)";

export default function TimeEntryListRoute() {
  const [isTabletUp, setIsTabletUp] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(TABLET_UP).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(TABLET_UP);
    const onChange = (e: MediaQueryListEvent) => setIsTabletUp(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTabletUp ? <TimeEntryList /> : <TodayScreen />;
}
