// Ported 1:1 from the Racked Artifact prototype's calendar/streak logic.

export function dateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return dateStr(new Date());
}

export type AttendanceMap = Record<string, boolean>;

export function computeStreaks(attendanceMap: AttendanceMap) {
  const dates = Object.keys(attendanceMap)
    .filter((d) => attendanceMap[d])
    .sort();
  if (!dates.length) return { current: 0, best: 0 };

  const dateSet = new Set(dates);
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T00:00:00");
    const cur = new Date(dates[i] + "T00:00:00");
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    run = diffDays === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!dateSet.has(dateStr(cursor))) cursor.setDate(cursor.getDate() - 1); // grace: today not logged yet
  let current = 0;
  while (dateSet.has(dateStr(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best };
}

export function daysInMonthGrid(monthDate: Date, attendanceMap: AttendanceMap) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const cells: { day: number | null; dateStr: string | null; isFuture: boolean; isToday: boolean; on: boolean }[] = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ day: null, dateStr: null, isFuture: false, isToday: false, on: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(new Date(year, month, d));
    cells.push({
      day: d,
      dateStr: ds,
      isFuture: ds > today,
      isToday: ds === today,
      on: !!attendanceMap[ds],
    });
  }
  return {
    cells,
    monthLabel: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    isCurrentMonth: year === new Date().getFullYear() && month === new Date().getMonth(),
  };
}
