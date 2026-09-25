"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { daysInMonthGrid, type AttendanceMap } from "@/lib/streaks";

export default function AttendanceCalendar({
  attendance,
  onToggle,
}: {
  attendance: AttendanceMap;
  onToggle: (dateStr: string) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const { cells, monthLabel, isCurrentMonth } = daysInMonthGrid(month, attendance);

  function shift(dir: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + dir, 1);
    const now = new Date();
    if (
      next.getFullYear() > now.getFullYear() ||
      (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())
    ) {
      return;
    }
    setMonth(next);
  }

  return (
    <div>
      <div className="cal-head">
        <button type="button" className="iconbtn cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
          <Icon name="back" />
        </button>
        <div className="cal-label">{monthLabel}</div>
        <button
          type="button"
          className="iconbtn cal-nav"
          disabled={isCurrentMonth}
          onClick={() => shift(1)}
          aria-label="Next month"
        >
          <Icon name="chev" />
        </button>
      </div>
      <div className="cal-dow">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((cell, i) =>
          cell.day === null ? (
            <div className="cal-cell empty" key={i} />
          ) : (
            <button
              type="button"
              key={i}
              className={`cal-cell${cell.on ? " on" : ""}${cell.isToday ? " today" : ""}`}
              disabled={cell.isFuture}
              onClick={() => cell.dateStr && onToggle(cell.dateStr)}
            >
              {cell.day}
            </button>
          )
        )}
      </div>
    </div>
  );
}
