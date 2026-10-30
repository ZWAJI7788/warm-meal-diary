const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISO(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, delta: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

export function weekdayCN(iso: string) {
  return WEEKDAYS[parseISO(iso).getDay()];
}

export function weekdayShort(iso: string) {
  return WEEKDAYS[parseISO(iso).getDay()].replace("周", "");
}

export function dayNumber(iso: string) {
  return parseISO(iso).getDate();
}

export function formatMonthDay(iso: string) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatMonth(iso: string) {
  return `${parseISO(iso).getMonth() + 1}月`;
}

export function formatFull(iso: string) {
  const d = parseISO(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function relativeDay(iso: string) {
  const today = todayISO();
  if (iso === today) return "今天";
  if (iso === addDays(today, -1)) return "昨天";
  if (iso === addDays(today, -2)) return "前天";
  return "";
}

export function formatCost(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return `¥${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

/** Monday of the week that contains `iso`. */
export function startOfWeek(iso: string) {
  const day = parseISO(iso).getDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekDates(startISO: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(startISO, i));
}

export function weeksBetween(fromStart: string, toStart: string) {
  return Math.round((parseISO(toStart).getTime() - parseISO(fromStart).getTime()) / 604800000);
}
