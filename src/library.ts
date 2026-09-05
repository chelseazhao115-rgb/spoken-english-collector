import type { ExpressionRecord } from "./records";

export type DateFilter = "all" | "today" | "this_week" | "custom";

export interface LibraryFilters {
  query: string;
  date: DateFilter;
  customStart: string;
  customEnd: string;
  scene: string;
  semanticGroup: string;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  query: "",
  date: "all",
  customStart: "",
  customEnd: "",
  scene: "",
  semanticGroup: "",
};

export function filterLibraryRecords(records: ExpressionRecord[], filters: LibraryFilters, now = new Date()) {
  const query = filters.query.trim().toLocaleLowerCase();
  const bounds = dateBounds(filters, now);
  return records.filter((record) => {
    if (query && ![record.expression, record.meaningZh, record.originalSentence].some((value) => value.toLocaleLowerCase().includes(query))) return false;
    if (filters.scene && !record.sceneTags.includes(filters.scene)) return false;
    if (filters.semanticGroup && record.semanticGroup !== filters.semanticGroup) return false;
    if (bounds) {
      const createdAt = new Date(record.createdAt).getTime();
      if (!Number.isFinite(createdAt) || createdAt < bounds.start || createdAt > bounds.end) return false;
    }
    return true;
  }).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
}

export function availableScenes(records: ExpressionRecord[]) {
  return uniqueSorted(records.flatMap((record) => record.sceneTags));
}

export function availableSemanticGroups(records: ExpressionRecord[]) {
  return uniqueSorted(records.map((record) => record.semanticGroup).filter(Boolean));
}

export function groupRecordsBySemantic(records: ExpressionRecord[]) {
  const groups = new Map<string, ExpressionRecord[]>();
  for (const record of records) {
    const key = record.semanticGroup || "OTHER";
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function hasActiveLibraryFilters(filters: LibraryFilters) {
  return Boolean(filters.query.trim() || filters.date !== "all" || filters.scene || filters.semanticGroup);
}

function dateBounds(filters: LibraryFilters, now: Date) {
  if (filters.date === "all") return null;
  if (filters.date === "today") {
    const start = startOfLocalDay(now);
    return { start: start.getTime(), end: endOfLocalDay(start).getTime() };
  }
  if (filters.date === "this_week") {
    const start = startOfLocalDay(now);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: start.getTime(), end: endOfLocalDay(end).getTime() };
  }
  const start = parseLocalDate(filters.customStart, false);
  const end = parseLocalDate(filters.customEnd, true);
  if (!start && !end) return null;
  return { start: start?.getTime() ?? Number.NEGATIVE_INFINITY, end: end?.getTime() ?? Number.POSITIVE_INFINITY };
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function parseLocalDate(value: string, atEnd: boolean) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return atEnd ? endOfLocalDay(date) : date;
}

function timestamp(value: string) {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : Number.NEGATIVE_INFINITY;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
