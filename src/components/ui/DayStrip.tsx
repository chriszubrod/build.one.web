import { ChevronLeft, ChevronRight } from "lucide-react";

interface DayStripProps {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  todayDate?: Date;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isFutureDay(day: Date, today: Date): boolean {
  return day.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function formatRange(start: Date): string {
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);
  const monthShort = (d: Date) => d.toLocaleString(undefined, { month: "short" });
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${monthShort(start)} ${start.getDate()} – ${end.getDate()}`
    : `${monthShort(start)} ${start.getDate()} – ${monthShort(end)} ${end.getDate()}`;
}

export default function DayStrip({ selectedDate, onDateChange, todayDate }: DayStripProps) {
  const today = todayDate ?? new Date();
  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * MS_PER_DAY));

  const isThisWeek = isSameDay(weekStart, startOfWeek(today));
  const rangeLabel = isThisWeek
    ? `This week · ${formatRange(weekStart)}`
    : formatRange(weekStart);

  const shiftWeek = (deltaDays: number) => {
    const newSelected = new Date(selectedDate.getTime() + deltaDays * MS_PER_DAY);
    onDateChange(newSelected);
  };

  return (
    <div className="day-strip">
      <div className="day-strip-header">
        <button type="button" className="day-strip-nav" onClick={() => shiftWeek(-7)} aria-label="Previous week">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="day-strip-range">{rangeLabel}</div>
        <button type="button" className="day-strip-nav" onClick={() => shiftWeek(7)} aria-label="Next week">
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="day-strip-week">
        {days.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isFuture = isFutureDay(day, today);
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={`day-strip-day${isSelected ? " day-strip-day-selected" : ""}${
                isFuture ? " day-strip-day-future" : ""
              }`}
              disabled={isFuture}
              onClick={() => !isFuture && onDateChange(day)}
            >
              <span className="day-strip-day-letter">{DAY_LETTERS[i]}</span>
              <span className="day-strip-day-num">{day.getDate()}</span>
              {isToday && !isSelected && <span className="day-strip-day-today-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
