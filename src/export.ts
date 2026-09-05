import type { LibraryFilters } from "./library";
import type { ExpressionRecord } from "./records";

export interface HtmlExportOptions {
  exportedAt?: Date;
  filterSummary?: string[];
  preset?: ExportPreset;
}

export type ExportPreset = "smart" | "full_notes" | "compact_review";

export function buildFilterSummary(filters: LibraryFilters) {
  const summary: string[] = [];
  if (filters.query.trim()) summary.push(`Search: “${filters.query.trim()}”`);
  if (filters.date === "today") summary.push("Date: Today");
  if (filters.date === "this_week") summary.push("Date: This Week");
  if (filters.date === "custom") {
    if (filters.customStart && filters.customEnd) summary.push(`Date: ${filters.customStart} to ${filters.customEnd}`);
    else if (filters.customStart) summary.push(`Date: From ${filters.customStart}`);
    else if (filters.customEnd) summary.push(`Date: Through ${filters.customEnd}`);
  }
  if (filters.scene) summary.push(`Scene: ${filters.scene}`);
  if (filters.semanticGroup) summary.push(`Meaning: ${filters.semanticGroup.replaceAll("_", " ")}`);
  return summary;
}

export function createExportFilename(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `spoken-english-collection-${year}-${month}-${day}.html`;
}

export function generateStandaloneHtml(records: readonly ExpressionRecord[], options: HtmlExportOptions = {}) {
  if (records.length === 0) throw new Error("No expressions to export.");
  const exportedAt = options.exportedAt ?? new Date();
  const preset = options.preset ?? "smart";
  const presetClass = preset.replaceAll("_", "-");
  const summary = options.filterSummary?.filter(Boolean) ?? [];
  const recordMarkup = renderRecordRows(records, preset);
  const filterMarkup = summary.length > 0
    ? `<section class="filter-summary" aria-label="Export filters"><p>Filtered collection</p><ul>${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My Spoken English Collection</title>
  <style>
    :root { color-scheme: light; --ink: #17212b; --muted: #61737d; --line: #d9e1e4; --paper: #fffdf8; --blue: #236684; --gold: #b88616; }
    * { box-sizing: border-box; }
    html { background: #e9eff1; }
    body { --entry-pad: 27px; --field-gap: 12px; --body-leading: 1.55; --column-gap: 28px; margin: 0; color: var(--ink); background: #e9eff1; font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    body.preset-full-notes { --entry-pad: 38px; --field-gap: 17px; --body-leading: 1.68; }
    body.preset-compact-review { --entry-pad: 17px; --field-gap: 7px; --body-leading: 1.4; --column-gap: 20px; }
    main { width: min(920px, calc(100% - 40px)); margin: 48px auto; padding: 64px clamp(28px, 7vw, 76px); background: var(--paper); box-shadow: 0 18px 55px rgba(23, 33, 43, .12); }
    .document-header { padding-bottom: 34px; border-bottom: 1px solid var(--ink); }
    h1 { max-width: 650px; margin: 0; font: 700 clamp(36px, 7vw, 68px)/.98 Georgia, "Times New Roman", serif; letter-spacing: -.035em; }
    .document-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 24px 0 0; color: var(--muted); font-size: 13px; }
    .document-meta strong { color: var(--ink); font-variant-numeric: tabular-nums; }
    .filter-summary { margin-top: 24px; padding: 16px 18px; background: #f0f5f6; }
    .filter-summary > p, .field-label { margin: 0 0 7px; color: var(--blue); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .filter-summary ul { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0; list-style: none; color: #40545f; font-size: 12px; }
    .collection { counter-reset: expression; display: block; min-height: 0; }
    .entry-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--column-gap); align-items: start; min-height: 0; }
    .entry-row-full { grid-template-columns: minmax(0, 1fr); }
    .entry { counter-increment: expression; display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; min-width: 0; padding: var(--entry-pad) 0; border-bottom: 1px solid var(--line); break-inside: avoid-page; page-break-inside: avoid; }
    .preset-full-notes .entry, .preset-smart .entry-full { grid-template-columns: 54px minmax(0, 1fr); gap: 22px; }
    .entry-number::before { content: counter(expression, decimal-leading-zero); color: var(--gold); font: 700 15px/1 Georgia, serif; font-variant-numeric: tabular-nums; }
    .entry-body { min-width: 0; }
    .expression-type { margin: 0 0 8px; color: var(--blue); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h2 { margin: 0; font: 700 clamp(23px, 3vw, 32px)/1.08 Georgia, "Times New Roman", serif; letter-spacing: -.025em; overflow-wrap: anywhere; }
    .preset-full-notes h2, .preset-smart .entry-full h2 { font-size: clamp(28px, 4vw, 40px); }
    .preset-compact-review h2 { font-size: clamp(21px, 2.7vw, 27px); }
    .ipa { margin: 7px 0 0; color: var(--muted); font-family: Georgia, "Times New Roman", serif; font-size: 15px; }
    .meaning { margin: 14px 0 0; font-size: 17px; font-weight: 750; line-height: var(--body-leading); overflow-wrap: anywhere; }
    .fields { display: grid; gap: var(--field-gap); margin-top: calc(var(--field-gap) + 6px); }
    .field p { margin: 0; color: #334852; font-size: 13px; line-height: var(--body-leading); white-space: pre-line; overflow-wrap: anywhere; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: calc(var(--field-gap) + 5px); }
    .tags span { padding: 5px 9px; border: 1px solid #cbdce3; border-radius: 999px; color: #315f73; font-size: 10px; font-weight: 700; }
    .alternatives { margin: 7px 0 0; padding-left: 18px; color: #334852; font-size: 13px; line-height: var(--body-leading); }
    .source { display: grid; gap: 5px; margin-top: calc(var(--field-gap) + 5px); padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
    .source p { margin: 0; overflow-wrap: anywhere; }
    .source a { color: var(--blue); text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }
    .created { margin: calc(var(--field-gap) + 1px) 0 0; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .preset-compact-review .meaning { margin-top: 9px; font-size: 15px; }
    .preset-compact-review .fields { margin-top: 12px; }
    .preset-compact-review .field p, .preset-compact-review .alternatives { font-size: 11px; }
    .preset-compact-review .source { margin-top: 10px; padding-top: 8px; border-top-style: dotted; font-size: 10px; }
    .preset-compact-review .created { margin-top: 8px; font-size: 10px; }
    @media (max-width: 700px) {
      main { width: 100%; margin: 0; padding: 38px 22px; box-shadow: none; }
      .entry-row { grid-template-columns: minmax(0, 1fr); }
      .entry, .preset-full-notes .entry, .preset-smart .entry-full { grid-template-columns: 36px minmax(0, 1fr); gap: 12px; }
      .document-meta { display: grid; gap: 5px; }
    }
    @page { size: A4; margin: 18mm 16mm; }
    @media print {
      html, body { background: #fff; }
      body { --entry-pad: 5mm; --column-gap: 8mm; color: #111; }
      body.preset-full-notes { --entry-pad: 7mm; }
      body.preset-compact-review { --entry-pad: 3.5mm; --column-gap: 6mm; }
      main { width: auto; margin: 0; padding: 0; background: #fff; box-shadow: none; }
      .document-header { padding-bottom: 7mm; break-after: auto; page-break-after: auto; }
      .filter-summary { background: #f2f2f2; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .collection { display: block; min-height: 0; break-inside: auto; page-break-inside: auto; }
      .entry-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--column-gap); min-height: 0; break-inside: auto; page-break-inside: auto; }
      .entry-row-full { grid-template-columns: minmax(0, 1fr); }
      .entry { grid-template-columns: 8mm minmax(0, 1fr); gap: 3mm; padding: var(--entry-pad) 0; box-shadow: none; break-inside: avoid-page; page-break-inside: avoid; }
      .preset-full-notes .entry, .preset-smart .entry-full { grid-template-columns: 12mm minmax(0, 1fr); gap: 5mm; }
      .entry-number::before, .expression-type, .field-label, .source a { color: #111; }
      .tags span { border-color: #777; color: #111; }
      .source, .created, .document-meta { color: #333; }
      a { color: #111; text-decoration: underline; }
    }
  </style>
</head>
<body class="preset-${presetClass}">
  <main>
    <header class="document-header">
      <h1>My Spoken English Collection</h1>
      <p class="document-meta"><span>Exported <strong>${escapeHtml(formatDate(exportedAt))}</strong></span><span><strong>${records.length}</strong> ${records.length === 1 ? "expression" : "expressions"}</span></p>
      ${filterMarkup}
    </header>
    <section class="collection" aria-label="Saved expressions">
      ${recordMarkup}
    </section>
  </main>
</body>
</html>`;
}

export function downloadHtmlFile(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderRecordRows(records: readonly ExpressionRecord[], preset: ExportPreset) {
  const rows: string[] = [];
  let halfWidthEntries: string[] = [];
  const flushHalfWidthEntries = () => {
    if (halfWidthEntries.length === 0) return;
    rows.push(`<div class="entry-row entry-row-half">${halfWidthEntries.join("")}</div>`);
    halfWidthEntries = [];
  };

  records.forEach((record, index) => {
    const fullWidth = preset === "full_notes" || (preset === "smart" && isLongExportRecord(record));
    const markup = renderRecord(record, index, fullWidth ? "entry-full" : "entry-half", preset);
    if (fullWidth) {
      flushHalfWidthEntries();
      rows.push(`<div class="entry-row entry-row-full">${markup}</div>`);
      return;
    }
    halfWidthEntries.push(markup);
    if (halfWidthEntries.length === 2) flushHalfWidthEntries();
  });
  flushHalfWidthEntries();
  return rows.join("\n");
}

function renderRecord(record: ExpressionRecord, index: number, widthClass: "entry-full" | "entry-half", preset: ExportPreset) {
  const compact = preset === "compact_review";
  const fields = compact
    ? [renderField("Original sentence", record.originalSentence), renderField("When to use it", compactText(record.usageZh))].join("")
    : [
      renderField("Original sentence", record.originalSentence),
      renderField("Translation", record.sentenceTranslationZh),
      renderField("Context", record.meaningInContextZh),
      renderField("When to use it", record.usageZh),
    ].join("");
  const tags = compact
    ? record.sceneTags
    : [...record.sceneTags, record.semanticGroup ? record.semanticGroup.replaceAll("_", " ") : ""].filter(Boolean);
  const alternatives = record.alternatives.filter((item) => item.expression).slice(0, compact ? 2 : undefined).map((item) => `<li><strong>${escapeHtml(item.expression)}</strong>${item.meaningZh ? ` — ${escapeHtml(item.meaningZh)}` : ""}</li>`).join("");
  const safeSourceUrl = safeHttpUrl(record.sourceUrl);
  const source = compact
    ? (record.sourceTitle ? `<div class="source"><p>${escapeHtml(record.sourceTitle)}</p></div>` : "")
    : record.sourceTitle || safeSourceUrl
    ? `<div class="source"><p class="field-label">Source</p>${record.sourceTitle ? `<p>${escapeHtml(record.sourceTitle)}</p>` : ""}${safeSourceUrl ? `<a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeSourceUrl)}</a>` : ""}</div>`
    : "";
  const created = formatRecordDate(record.createdAt);
  return `<article class="entry ${widthClass}" data-record-id="${escapeHtml(record.id)}">
    <div class="entry-number" aria-label="Expression ${index + 1}"></div>
    <div class="entry-body">
      ${!compact && record.expressionType ? `<p class="expression-type">${escapeHtml(record.expressionType.replaceAll("_", " "))}</p>` : ""}
      <h2>${escapeHtml(record.expression)}</h2>
      ${record.ipa ? `<p class="ipa">${escapeHtml(record.ipa)}</p>` : ""}
      ${record.meaningZh ? `<p class="meaning">${escapeHtml(record.meaningZh)}</p>` : ""}
      ${fields ? `<div class="fields">${fields}</div>` : ""}
      ${tags.length > 0 ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${alternatives ? `<div class="field"><p class="field-label">Similar expressions</p><ul class="alternatives">${alternatives}</ul></div>` : ""}
      ${source}
      ${created ? `<p class="created">Collected ${escapeHtml(created)}</p>` : ""}
    </div>
  </article>`;
}

function compactText(value: string, maxLength = 180) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function isLongExportRecord(record: ExpressionRecord) {
  const alternativesLength = record.alternatives.reduce((total, item) => total + item.expression.length + (item.meaningZh?.length ?? 0), 0);
  const textLength = record.originalSentence.length
    + record.sentenceTranslationZh.length
    + record.meaningInContextZh.length
    + record.usageZh.length
    + alternativesLength;
  return textLength > 320
    || record.originalSentence.length > 150
    || record.meaningInContextZh.length > 130
    || record.usageZh.length > 150;
}

function renderField(label: string, value?: string) {
  return value ? `<section class="field"><p class="field-label">${escapeHtml(label)}</p><p>${escapeHtml(value)}</p></section>` : "";
}

function safeHttpUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatRecordDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
