export function formatTime(minutes?: number): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function plural(count: number, word: string, pluralWord?: string): string {
  return count === 1 ? word : pluralWord ?? `${word}s`;
}

export function todayKey(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekDays(count = 7, startOffset = 0): Array<{
  key: string;
  dow: string;
  num: number;
  isToday: boolean;
  label: string;
}> {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index + startOffset);
    const key = todayKey(index + startOffset);
    return {
      key,
      dow: date.toLocaleDateString("en-GB", { weekday: "short" }),
      num: date.getDate(),
      isToday: index + startOffset === 0,
      label: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }),
    };
  });
}

export function relativeDay(iso?: string): string {
  if (!iso) return "not yet";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Late-night snack?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function expiryLabel(days?: number): string | undefined {
  if (days === undefined) return undefined;
  if (days < 0) return "past it";
  if (days === 0) return "use today";
  if (days === 1) return "1 day left";
  if (days <= 3) return `${days} days left`;
  return `${days} days`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function titleCase(input: string): string {
  return input.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
