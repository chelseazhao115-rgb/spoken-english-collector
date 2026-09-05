import { describe, expect, it } from "vitest";
import { availableScenes, availableSemanticGroups, EMPTY_LIBRARY_FILTERS, filterLibraryRecords, groupRecordsBySemantic, hasActiveLibraryFilters } from "./library";
import type { ExpressionRecord } from "./records";

const now = new Date(2026, 8, 9, 12);

function makeRecord(index: number, overrides: Partial<ExpressionRecord> = {}): ExpressionRecord {
  return {
    id: `record-${index}`,
    originalSentence: `Original sentence ${index}`,
    sentenceTranslationZh: `原句 ${index}`,
    expression: `expression ${index}`,
    meaningZh: `释义 ${index}`,
    meaningInContextZh: "上下文含义",
    usageZh: "用法",
    expressionType: "conversational_phrase",
    naturalness: "natural",
    semanticGroup: index % 2 ? "VERY_BUSY" : "EASY_TASK",
    sceneTags: index % 2 ? ["Work"] : ["Daily Conversation"],
    alternatives: [],
    sourceType: "web",
    sourceUrl: "https://example.com",
    capturedAt: new Date(2026, 8, 1).toISOString(),
    createdAt: new Date(2026, 8, index + 1, 10).toISOString(),
    updatedAt: new Date(2026, 8, index + 1, 10).toISOString(),
    userEdited: false,
    ...overrides,
  };
}

const records = Array.from({ length: 20 }, (_, index) => makeRecord(index));

describe("Library filtering", () => {
  it("loads about 20 records and sorts by createdAt descending", () => {
    const result = filterLibraryRecords(records, EMPTY_LIBRARY_FILTERS, now);
    expect(result).toHaveLength(20);
    expect(result[0].id).toBe("record-19");
    expect(result.at(-1)?.id).toBe("record-0");
  });

  it("uses createdAt, not updatedAt, for Today", () => {
    const oldButEditedToday = makeRecord(30, { id: "edited", createdAt: new Date(2026, 8, 1).toISOString(), updatedAt: now.toISOString() });
    const today = makeRecord(31, { id: "today", createdAt: new Date(2026, 8, 9, 8).toISOString() });
    const result = filterLibraryRecords([oldButEditedToday, today], { ...EMPTY_LIBRARY_FILTERS, date: "today" }, now);
    expect(result.map((record) => record.id)).toEqual(["today"]);
  });

  it("filters This Week from local Monday through Sunday", () => {
    const result = filterLibraryRecords(records, { ...EMPTY_LIBRARY_FILTERS, date: "this_week" }, now);
    expect(result.map((record) => record.id)).toEqual(["record-12", "record-11", "record-10", "record-9", "record-8", "record-7", "record-6"]);
  });

  it("supports an inclusive custom date and date range", () => {
    const oneDay = filterLibraryRecords(records, { ...EMPTY_LIBRARY_FILTERS, date: "custom", customStart: "2026-09-05", customEnd: "2026-09-05" }, now);
    expect(oneDay.map((record) => record.id)).toEqual(["record-4"]);
    const range = filterLibraryRecords(records, { ...EMPTY_LIBRARY_FILTERS, date: "custom", customStart: "2026-09-03", customEnd: "2026-09-05" }, now);
    expect(range.map((record) => record.id)).toEqual(["record-4", "record-3", "record-2"]);
  });

  it("searches expression case-insensitively, Chinese meaning, and original sentence", () => {
    const special = makeRecord(40, { expression: "I'm SWAMPED", meaningZh: "忙得不可开交", originalSentence: "Work has been hectic lately." });
    expect(filterLibraryRecords([special], { ...EMPTY_LIBRARY_FILTERS, query: "swamped" }, now)).toHaveLength(1);
    expect(filterLibraryRecords([special], { ...EMPTY_LIBRARY_FILTERS, query: "不可开交" }, now)).toHaveLength(1);
    expect(filterLibraryRecords([special], { ...EMPTY_LIBRARY_FILTERS, query: "HECTIC" }, now)).toHaveLength(1);
  });

  it("derives scene and semantic options from records", () => {
    expect(availableScenes(records)).toEqual(["Daily Conversation", "Work"]);
    expect(availableSemanticGroups(records)).toEqual(["EASY_TASK", "VERY_BUSY"]);
  });

  it("combines search, date, scene, and semantic filters", () => {
    const matching = makeRecord(50, { expression: "busy week", sceneTags: ["Work"], semanticGroup: "VERY_BUSY", createdAt: new Date(2026, 8, 9).toISOString() });
    const wrongScene = makeRecord(51, { expression: "busy week", sceneTags: ["Study"], semanticGroup: "VERY_BUSY", createdAt: new Date(2026, 8, 9).toISOString() });
    const result = filterLibraryRecords([matching, wrongScene, ...records], { ...EMPTY_LIBRARY_FILTERS, query: "busy", date: "this_week", scene: "Work", semanticGroup: "VERY_BUSY" }, now);
    expect(result.map((record) => record.id)).toEqual(["record-50"]);
  });

  it("clear filters restores all records", () => {
    const filtered = { ...EMPTY_LIBRARY_FILTERS, query: "missing", date: "today" as const, scene: "Work", semanticGroup: "VERY_BUSY" };
    expect(filterLibraryRecords(records, filtered, now)).toHaveLength(0);
    expect(filterLibraryRecords(records, EMPTY_LIBRARY_FILTERS, now)).toHaveLength(20);
    expect(hasActiveLibraryFilters(filtered)).toBe(true);
    expect(hasActiveLibraryFilters(EMPTY_LIBRARY_FILTERS)).toBe(false);
  });

  it("keeps candidates sharing a sentence and source as independent records", () => {
    const shared = { originalSentence: "Shared sentence", sourceUrl: "https://example.com/shared", capturedAt: new Date(2026, 8, 9).toISOString() };
    const candidates = [
      makeRecord(60, { ...shared, expression: "a piece of cake" }),
      makeRecord(61, { ...shared, expression: "easier said than done" }),
      makeRecord(62, { ...shared, expression: "the tip of the iceberg" }),
    ];
    expect(filterLibraryRecords(candidates, EMPTY_LIBRARY_FILTERS, now)).toHaveLength(3);
  });

  it("groups filtered records by the existing semanticGroup", () => {
    const grouped = groupRecordsBySemantic(filterLibraryRecords(records.slice(0, 4), EMPTY_LIBRARY_FILTERS, now));
    expect(grouped.map(([group]) => group)).toEqual(["EASY_TASK", "VERY_BUSY"]);
    expect(grouped.flatMap(([, items]) => items)).toHaveLength(4);
  });
});
