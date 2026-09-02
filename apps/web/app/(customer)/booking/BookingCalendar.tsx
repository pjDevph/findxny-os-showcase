"use client";

import { useMemo, useState } from "react";

export interface DayAvailability {
  fullyBooked?: boolean;
  bookedSlots?: Set<string>;
}

export interface BookingCalendarProps {
  selectedDate: string;
  selectedTime: string;
  onDateChange: (iso: string) => void;
  onTimeChange: (time: string) => void;
  timeSlots: string[];
  availability?: Record<string, DayAvailability>;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function BookingCalendar({
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeChange,
  timeSlots,
  availability = {},
}: BookingCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));

  const grid = useMemo(() => {
    const first = startOfMonth(viewMonth);
    // Monday-first offset (Mon=0 … Sun=6)
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [viewMonth]);

  function shiftMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const selectedAvailability = selectedDate ? availability[selectedDate] : undefined;
  const bookedSlots = selectedAvailability?.bookedSlots ?? new Set<string>();

  const canGoBack =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  return (
    <div className="cal">
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="cal-title">
          <span className="cal-month">{MONTHS[viewMonth.getMonth()]}</span>
          <span className="cal-year">{viewMonth.getFullYear()}</span>
        </div>
        <button type="button" className="cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="cal-dow">
        {DOW.map((d) => <div key={d} className="cal-dow-c">{d}</div>)}
      </div>

      <div className="cal-grid">
        {grid.map((cell, i) => {
          if (!cell.date) return <div key={i} className="cal-cell cal-empty" aria-hidden />;
          const iso = isoDate(cell.date);
          const dayAvail = availability[iso];
          const isPast = cell.date < today;
          const isFull = !!dayAvail?.fullyBooked;
          const isSelected = iso === selectedDate;
          const isToday = iso === isoDate(today);
          const disabled = isPast || isFull;

          let label = `${cell.date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}`;
          if (isFull) label += " — fully booked";
          if (isPast) label += " — past";

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onDateChange(iso)}
              aria-label={label}
              aria-pressed={isSelected}
              className={[
                "cal-cell",
                "cal-day",
                isSelected ? "is-selected" : "",
                isFull ? "is-booked" : "",
                isPast ? "is-past" : "",
                isToday ? "is-today" : "",
              ].filter(Boolean).join(" ")}
              data-tip={isFull ? "Fully Booked" : undefined}
            >
              <span className="cal-num">{cell.date.getDate()}</span>
              {isFull && (
                <svg className="cal-lock" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              )}
              {isToday && !isSelected && <span className="cal-dot" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="cal-legend" aria-hidden>
        <span className="lg lg-avail">Available</span>
        <span className="lg lg-sel">Selected</span>
        <span className="lg lg-full">Fully booked</span>
      </div>

      <div className="cal-slots-wrap">
        <div className="cal-slots-head">
          <span className="eyebrow" style={{ margin: 0 }}>Available times</span>
          {selectedDate && (
            <span className="cal-slots-date">
              {new Date(selectedDate).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
            </span>
          )}
        </div>
        {!selectedDate ? (
          <div className="cal-slots-empty">Pick a date to see open seatings.</div>
        ) : (
          <div className="cal-slots">
            {timeSlots.map((t) => {
              const booked = bookedSlots.has(t);
              const isSel = !booked && t === selectedTime;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={booked}
                  onClick={() => !booked && onTimeChange(t)}
                  aria-pressed={isSel}
                  className={[
                    "cal-slot",
                    isSel ? "is-selected" : "",
                    booked ? "is-booked" : "",
                  ].filter(Boolean).join(" ")}
                  data-tip={booked ? "Reserved" : undefined}
                >
                  <span className="cal-slot-time">{t}</span>
                  {booked && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
