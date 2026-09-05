import { describe, expect, it } from "vitest";
import { buildFilterSummary, createExportFilename, generateStandaloneHtml, isLongExportRecord } from "./export";
import { EMPTY_LIBRARY_FILTERS, filterLibraryRecords } from "./library";
import type { ExpressionRecord } from "./records";

function makeRecord(index: number, overrides: Partial<ExpressionRecord> = {}): ExpressionRecord {
  return {
    id: `record-${index}`,
    originalSentence: `Original sentence ${index}`,
    sentenceTranslationZh: `原句翻译 ${index}`,
    expression: `expression ${index}`,
    ipa: `/test ${index}/`,
    meaningZh: `中文释义 ${index}`,
    meaningInContextZh: `上下文含义 ${index}`,
    usageZh: `使用说明 ${index}`,
    expressionType: "idiom",
    naturalness: "very_natural",
    semanticGroup: index % 2 ? "VERY_BUSY" : "EASY_TASK",
    sceneTags: index % 2 ? ["Work"] : ["Daily Conversation"],
    alternatives: [{ expression: `alternative ${index}`, meaningZh: `替代表达 ${index}` }],
    sourceType: "web",
    sourceTitle: `Source ${index}`,
    sourceUrl: `https://example.com/${index}`,
    capturedAt: new Date(2026, 8, 1).toISOString(),
    createdAt: new Date(2026, 8, index + 1, 10).toISOString(),
    updatedAt: new Date(2026, 8, index + 1, 10).toISOString(),
    userEdited: false,
    ...overrides,
  };
}

const records = [makeRecord(0), makeRecord(1), makeRecord(2)];
const exportedAt = new Date(2026, 8, 5, 12);

describe("standalone HTML export", () => {
  it("exports all records as independent editorial entries", () => {
    const html = generateStandaloneHtml(records, { exportedAt });
    expect(html.match(/<article class="entry\b/g)).toHaveLength(3);
    expect(html).toContain("<strong>3</strong> expressions");
    records.forEach((record) => expect(html).toContain(record.expression));
  });

  it.each([
    ["search", { ...EMPTY_LIBRARY_FILTERS, query: "expression 1" }, "expression 1"],
    ["date", { ...EMPTY_LIBRARY_FILTERS, date: "custom" as const, customStart: "2026-09-02", customEnd: "2026-09-02" }, "expression 1"],
    ["scene", { ...EMPTY_LIBRARY_FILTERS, scene: "Work" }, "expression 1"],
    ["combined", { ...EMPTY_LIBRARY_FILTERS, query: "expression", date: "custom" as const, customStart: "2026-09-02", customEnd: "2026-09-03", scene: "Work", semanticGroup: "VERY_BUSY" }, "expression 1"],
  ])("exports only the current %s-filtered records", (_name, filters, expected) => {
    const filtered = filterLibraryRecords(records, filters, exportedAt);
    const html = generateStandaloneHtml(filtered, { exportedAt, filterSummary: buildFilterSummary(filters) });
    expect(html.match(/<article class="entry\b/g)).toHaveLength(1);
    expect(html).toContain(expected);
    expect(html).not.toContain("expression 0</h2>");
    expect(html).not.toContain("expression 2</h2>");
    expect(html).toContain("Filtered collection");
  });

  it("renders Chinese, IPA, alternatives, and a clickable source URL", () => {
    const html = generateStandaloneHtml([records[0]], { exportedAt });
    expect(html).toContain("中文释义 0");
    expect(html).toContain("/test 0/");
    expect(html).toContain("alternative 0");
    expect(html).toContain("替代表达 0");
    expect(html).toContain('href="https://example.com/0"');
    expect(html).toContain("<meta charset=\"utf-8\">");
  });

  it("omits empty optional fields and never renders undefined or null", () => {
    const html = generateStandaloneHtml([makeRecord(4, { ipa: undefined, sourceTitle: undefined, sourceUrl: undefined, alternatives: [], sceneTags: [], semanticGroup: "", meaningInContextZh: "", usageZh: "" })], { exportedAt });
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(html).not.toContain("Similar expressions");
    expect(html).not.toContain("Source</p>");
    expect(html).not.toContain("Context</p>");
    expect(html).not.toContain("When to use it</p>");
  });

  it("escapes record text and excludes unsafe source protocols", () => {
    const html = generateStandaloneHtml([makeRecord(5, { expression: "<script>alert('x')</script>", sourceUrl: "javascript:alert(1)" })], { exportedAt });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });

  it("contains all styling and print rules without runtime or online dependencies", () => {
    const html = generateStandaloneHtml([records[0]], { exportedAt });
    expect(html).toContain("<style>");
    expect(html).toContain("@media print");
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("break-inside: avoid-page");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("@import");
  });

  it("renders Full Notes as a complete single-column layout", () => {
    const html = generateStandaloneHtml(records, { exportedAt, preset: "full_notes" });
    expect(html).toContain('<body class="preset-full-notes">');
    expect(html.match(/class="entry entry-full"/g)).toHaveLength(3);
    expect(html.match(/class="entry-row entry-row-full"/g)).toHaveLength(3);
    expect(html).toContain("Original sentence");
    expect(html).toContain("Translation");
    expect(html).toContain("Context");
    expect(html).toContain("When to use it");
    expect(html).toContain('href="https://example.com/0"');
  });

  it("renders Compact Review in paired rows with reduced metadata", () => {
    const compactRecord = makeRecord(21, {
      alternatives: [
        { expression: "first alternative", meaningZh: "第一" },
        { expression: "second alternative", meaningZh: "第二" },
        { expression: "third alternative", meaningZh: "第三" },
      ],
      usageZh: "使用说明".repeat(60),
    });
    const html = generateStandaloneHtml([compactRecord, records[1], records[2]], { exportedAt, preset: "compact_review" });
    expect(html).toContain('<body class="preset-compact-review">');
    expect(html.match(/class="entry-row entry-row-half"/g)).toHaveLength(2);
    expect(html.match(/class="entry entry-half"/g)).toHaveLength(3);
    expect(html).toContain("Original sentence");
    expect(html).toContain("When to use it");
    expect(html).toContain("first alternative");
    expect(html).toContain("second alternative");
    expect(html).not.toContain("third alternative");
    expect(html).not.toContain("Translation</p>");
    expect(html).not.toContain("Context</p>");
    expect(html).not.toContain("EASY TASK");
    expect(html).not.toContain('href="https://example.com/21"');
    expect(html).toContain("…");
  });

  it("keeps short Smart entries paired and promotes long entries to a full row", () => {
    const longRecord = makeRecord(20, {
      originalSentence: "This is a deliberately long sentence selected to verify that a content-heavy expression receives enough horizontal room in the exported notebook layout.",
      usageZh: "这是较长的使用说明。".repeat(18),
    });
    const html = generateStandaloneHtml([records[0], records[1], longRecord], { exportedAt, preset: "smart" });
    expect(html).toContain('<body class="preset-smart">');
    expect(isLongExportRecord(records[0])).toBe(false);
    expect(isLongExportRecord(longRecord)).toBe(true);
    expect(html.match(/class="entry entry-half"/g)).toHaveLength(2);
    expect(html.match(/class="entry entry-full"/g)).toHaveLength(1);
    expect(html.match(/class="entry-row entry-row-half"/g)).toHaveLength(1);
    expect(html.match(/class="entry-row entry-row-full"/g)).toHaveLength(1);
  });

  it("gives the three presets distinct spacing and typography rules", () => {
    const html = generateStandaloneHtml([records[0]], { exportedAt });
    expect(html).toContain("body.preset-full-notes { --entry-pad: 38px");
    expect(html).toContain("body.preset-compact-review { --entry-pad: 17px");
    expect(html).toContain(".preset-compact-review h2");
  });

  it("forces every preset to one column on narrow screens", () => {
    const html = generateStandaloneHtml([records[0]], { exportedAt });
    expect(html).toContain("@media (max-width: 700px)");
    expect(html).toContain(".entry-row { grid-template-columns: minmax(0, 1fr); }");
  });

  it("keeps the print collection in normal page flow and avoids breaks only within cards", () => {
    const html = generateStandaloneHtml(records, { exportedAt });
    expect(html).toContain(".collection { display: block; min-height: 0; break-inside: auto; page-break-inside: auto; }");
    expect(html).toContain(".entry-row { display: grid;");
    expect(html).toContain("break-inside: auto; page-break-inside: auto;");
    expect(html).toContain(".entry { grid-template-columns: 8mm minmax(0, 1fr);");
    expect(html).toContain("break-inside: avoid-page; page-break-inside: avoid;");
  });

  it("keeps same-sentence candidates separate", () => {
    const shared = { originalSentence: "One shared sentence", sourceUrl: "https://example.com/shared" };
    const candidates = [
      makeRecord(10, { ...shared, expression: "a piece of cake" }),
      makeRecord(11, { ...shared, expression: "easier said than done" }),
      makeRecord(12, { ...shared, expression: "the tip of the iceberg" }),
    ];
    const html = generateStandaloneHtml(candidates, { exportedAt });
    expect(html.match(/<article class="entry\b/g)).toHaveLength(3);
    candidates.forEach((record) => expect(html).toContain(record.expression));
  });

  it("does not mutate source records", () => {
    const before = structuredClone(records);
    generateStandaloneHtml(records, { exportedAt });
    expect(records).toEqual(before);
  });

  it("refuses an empty export", () => {
    expect(() => generateStandaloneHtml([])).toThrow("No expressions to export");
  });

  it("uses the required local-date filename", () => {
    expect(createExportFilename(exportedAt)).toBe("spoken-english-collection-2026-09-05.html");
  });
});
