/** Local-time month boundaries (matches dashboard stats). */
export function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function monthRangeFromDate(d: Date) {
  return monthRange(d.getFullYear(), d.getMonth() + 1);
}

export function previousMonthRange(year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return monthRange(prevYear, prevMonth);
}
