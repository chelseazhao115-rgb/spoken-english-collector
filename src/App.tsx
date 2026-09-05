import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import type { AnalyzedExpression, ExpressionAnalysis } from "./ai";
import { activeCandidateAnalysis, cacheCandidateAnalysis, candidateKey, createCandidateSession, selectCandidate } from "./candidates";
import type { CandidateSession } from "./candidates";
import { cropScreenshot } from "./crop";
import { addExpressionRecord, deleteExpressionRecord, getAllExpressionRecords, updateExpressionRecord } from "./db";
import type { AnalysisResponse, ExtensionMessage } from "./messages";
import { buildExpressionRecord, RECORD_EXPRESSION_TYPES, RECORD_NATURALNESS_VALUES } from "./records";
import type { CaptureSource, ExpressionRecord } from "./records";
import { isTargetLookupInput } from "./lookup";
import { availableScenes, availableSemanticGroups, EMPTY_LIBRARY_FILTERS, filterLibraryRecords, groupRecordsBySemantic, hasActiveLibraryFilters } from "./library";
import type { DateFilter, LibraryFilters } from "./library";
import { buildFilterSummary, createExportFilename, downloadHtmlFile, generateStandaloneHtml } from "./export";
import type { ExportPreset } from "./export";

type CaptureStatus = "idle" | "selecting" | "cropping" | "recognizing" | "done" | "error";
type AnalysisStatus = "idle" | "analyzing" | "done" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type ActiveView = "collect" | "library";

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>("collect");
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("idle");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysis, setAnalysis] = useState<ExpressionAnalysis | null>(null);
  const [candidateSession, setCandidateSession] = useState<CandidateSession | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<string | undefined>();
  const [apiKey, setApiKey] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [source, setSource] = useState<CaptureSource | null>(null);
  const [candidateSaveStates, setCandidateSaveStates] = useState<Record<string, SaveStatus>>({});
  const [candidateSaveErrors, setCandidateSaveErrors] = useState<Record<string, string>>({});
  const [savedRecords, setSavedRecords] = useState<ExpressionRecord[]>([]);
  const [recordsError, setRecordsError] = useState("");
  const [editingRecord, setEditingRecord] = useState<ExpressionRecord | null>(null);
  const runId = useRef(0);
  const savingCandidates = useRef(new Set<string>());
  const pendingRecordIds = useRef(new Map<string, string>());

  useEffect(() => {
    void chrome.storage.local.get("aiApiKey").then((settings) => {
      const saved = typeof settings.aiApiKey === "string" ? settings.aiApiKey : "";
      setApiKey(saved);
      setHasSavedKey(Boolean(saved));
      setShowSettings(!saved);
    });
  }, []);

  useEffect(() => {
    void refreshSavedRecords();
  }, []);

  useEffect(() => {
    const onMessage = (message: ExtensionMessage) => {
      if (message.type === "CAPTURE_STARTED") setCaptureStatus("selecting");
      if (message.type === "CAPTURE_CANCELLED") setCaptureStatus(text ? "done" : "idle");
      if (message.type === "CAPTURE_ERROR") {
        setError(message.message);
        setCaptureStatus("error");
      }
      if (message.type === "CAPTURE_READY") void recognize(message);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [text]);

  async function recognize(message: Extract<ExtensionMessage, { type: "CAPTURE_READY" }>) {
    const currentRun = ++runId.current;
    resetAnalysis();
    setError("");
    setProgress(0);
    setCaptureStatus("cropping");
    setSource(message.source);
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      const cropped = await cropScreenshot(message.imageDataUrl, message.rect, message.viewportWidth, message.viewportHeight);
      if (currentRun !== runId.current) return;
      setCaptureStatus("recognizing");
      worker = await createWorker("eng", 1, {
        workerPath: chrome.runtime.getURL("ocr/worker.min.js"),
        corePath: chrome.runtime.getURL("ocr/tesseract-core-simd-lstm.wasm.js"),
        langPath: chrome.runtime.getURL("ocr"),
        workerBlobURL: false,
        logger: (event) => {
          if (event.status === "recognizing text") setProgress(Math.round(event.progress * 100));
        },
      });
      const result = await worker.recognize(cropped);
      if (currentRun !== runId.current) return;
      setText(cleanText(result.data.text));
      setCaptureStatus("done");
    } catch {
      if (currentRun === runId.current) {
        setError("Text recognition failed. Try a tighter selection around clear English text.");
        setCaptureStatus("error");
      }
    } finally {
      await worker?.terminate();
    }
  }

  function capture() {
    setError("");
    void chrome.runtime.sendMessage({ type: "START_CAPTURE" } satisfies ExtensionMessage);
  }

  function updateText(value: string) {
    setText(value);
    resetAnalysis();
  }

  function resetAnalysis() {
    setAnalysis(null);
    setCandidateSession(null);
    setAnalysisError("");
    setAnalysisStatus("idle");
    setAnalysisTarget(undefined);
    resetSaveState();
  }

  function resetSaveState() {
    savingCandidates.current.clear();
    pendingRecordIds.current.clear();
    setCandidateSaveStates({});
    setCandidateSaveErrors({});
  }

  async function refreshSavedRecords() {
    try {
      setSavedRecords(await getAllExpressionRecords());
      setRecordsError("");
    } catch (storageError) {
      setRecordsError(storageError instanceof Error ? storageError.message : String(storageError));
    }
  }

  async function saveApiKey() {
    const normalized = apiKey.trim();
    if (normalized) await chrome.storage.local.set({ aiApiKey: normalized });
    else await chrome.storage.local.remove("aiApiKey");
    setApiKey(normalized);
    setHasSavedKey(Boolean(normalized));
    setShowSettings(!normalized);
  }

  async function requestAnalysis(targetExpression?: string) {
    const totalStarted = performance.now();
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_EXPRESSION",
      text: text.trim(),
      targetExpression,
    } satisfies ExtensionMessage) as AnalysisResponse;
    if (!response?.ok) throw new Error(response?.error || "The analysis request did not complete.");
    return { response, totalStarted };
  }

  function finishAnalysis(data: ExpressionAnalysis, timings: AnalysisResponse & { ok: true }, totalStarted: number, mode: string) {
    const renderStarted = performance.now();
    setAnalysis(data);
    setAnalysisStatus("done");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.info("Analyze timings", {
          ...timings.timings,
          uiRenderMs: Math.round((performance.now() - renderStarted) * 100) / 100,
          totalAnalyzeMs: Math.round((performance.now() - totalStarted) * 100) / 100,
          mode,
        });
      });
    });
  }

  async function analyzeInitial() {
    if (!hasSavedKey) {
      setShowSettings(true);
      setAnalysisError("Add and save an AI API key before analyzing.");
      setAnalysisStatus("error");
      return;
    }
    const lookupMode = isTargetLookupInput(text);
    setAnalysis(null);
    setCandidateSession(null);
    setAnalysisError("");
    setAnalysisStatus("analyzing");
    setAnalysisTarget(undefined);
    resetSaveState();
    try {
      const { response, totalStarted } = await requestAnalysis(lookupMode ? text.trim() : undefined);
      const session = createCandidateSession(response.data);
      setCandidateSession(session);
      finishAnalysis(session ? activeCandidateAnalysis(session)! : response.data, response, totalStarted, lookupMode ? "target-lookup" : "initial-discovery");
    } catch (requestError) {
      setAnalysisError(requestError instanceof Error ? requestError.message : String(requestError));
      setAnalysisStatus("error");
    }
  }

  async function chooseCandidate(key: string) {
    if (!candidateSession || analysisStatus === "analyzing") return;
    const selectedSession = selectCandidate(candidateSession, key);
    setCandidateSession(selectedSession);
    const cached = activeCandidateAnalysis(selectedSession);
    if (cached) {
      setAnalysis(cached);
      setAnalysisError("");
      setAnalysisStatus("done");
      setAnalysisTarget(undefined);
      return;
    }
    const candidate = selectedSession.candidates.find((item) => item.key === key)!;
    setAnalysis(null);
    setAnalysisError("");
    setAnalysisStatus("analyzing");
    setAnalysisTarget(candidate.expression);
    try {
      const { response, totalStarted } = await requestAnalysis(candidate.expression);
      const updatedSession = cacheCandidateAnalysis(selectedSession, key, response.data);
      setCandidateSession(updatedSession);
      finishAnalysis(activeCandidateAnalysis(updatedSession)!, response, totalStarted, "targeted-candidate");
      setAnalysisTarget(undefined);
    } catch (requestError) {
      setAnalysisError(requestError instanceof Error ? requestError.message : String(requestError));
      setAnalysisStatus("error");
    }
  }

  function retryAnalysis() {
    if (analysisTarget && candidateSession) void chooseCandidate(candidateSession.activeKey);
    else void analyzeInitial();
  }

  async function savePrimary() {
    if (!analysis || !analysis.has_useful_expression || !analysis.primary_expression || !candidateSession) return;
    const key = candidateSession.activeKey || candidateKey(analysis.primary_expression.expression);
    if (savingCandidates.current.has(key) || candidateSaveStates[key] === "saved") return;
    savingCandidates.current.add(key);
    setCandidateSaveStates((current) => ({ ...current, [key]: "saving" }));
    setCandidateSaveErrors((current) => ({ ...current, [key]: "" }));
    const recordId = pendingRecordIds.current.get(key) ?? crypto.randomUUID();
    pendingRecordIds.current.set(key, recordId);
    try {
      const record = buildExpressionRecord(
        analysis,
        source ?? { sourceType: "other", capturedAt: new Date().toISOString() },
        undefined,
        recordId,
      );
      await addExpressionRecord(record);
      setSavedRecords((current) => [record, ...current]);
      setCandidateSaveStates((current) => ({ ...current, [key]: "saved" }));
    } catch (storageError) {
      setCandidateSaveErrors((current) => ({ ...current, [key]: storageError instanceof Error ? storageError.message : String(storageError) }));
      setCandidateSaveStates((current) => ({ ...current, [key]: "error" }));
    } finally {
      savingCandidates.current.delete(key);
    }
  }

  async function saveEditedRecord(record: ExpressionRecord) {
    try {
      const updated = { ...record, updatedAt: new Date().toISOString(), userEdited: true };
      await updateExpressionRecord(updated);
      setSavedRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingRecord(null);
      setRecordsError("");
    } catch (storageError) {
      setRecordsError(storageError instanceof Error ? storageError.message : String(storageError));
    }
  }

  async function removeSavedRecord(record: ExpressionRecord) {
    if (!window.confirm(`Delete “${record.expression}”? This cannot be undone.`)) return;
    try {
      await deleteExpressionRecord(record.id);
      setSavedRecords((current) => current.filter((item) => item.id !== record.id));
      if (editingRecord?.id === record.id) setEditingRecord(null);
      setRecordsError("");
    } catch (storageError) {
      setRecordsError(storageError instanceof Error ? storageError.message : String(storageError));
    }
  }

  const busy = captureStatus === "cropping" || captureStatus === "recognizing" || analysisStatus === "analyzing";

  return (
    <main className="panel">
      <header>
        <div className="brand-mark" aria-hidden="true"><span>“</span></div>
        <div><p className="eyebrow">Spoken English</p><h1>Collector</h1></div>
        <button className="settings-toggle" onClick={() => setShowSettings((visible) => !visible)} aria-expanded={showSettings}>API</button>
      </header>

      <nav className="workspace-tabs" aria-label="Main sections">
        <button className={activeView === "collect" ? "tab-active" : ""} onClick={() => setActiveView("collect")} aria-current={activeView === "collect" ? "page" : undefined}>Collect</button>
        <button className={activeView === "library" ? "tab-active" : ""} onClick={() => setActiveView("library")} aria-current={activeView === "library" ? "page" : undefined}>Library <span>{savedRecords.length}</span></button>
      </nav>

      {showSettings && (
        <section className="settings-card">
          <div><p className="step-label">AI</p><p>Stored only in this browser profile.</p></div>
          <label htmlFor="api-key">API key</label>
          <div className="key-row">
            <input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" autoComplete="off" />
            <button onClick={() => void saveApiKey()}>{apiKey.trim() ? "Save key" : "Remove"}</button>
          </div>
        </section>
      )}

      {activeView === "collect" ? <>
      <section className="capture-card">
        <p className="step-label">01 · Capture</p>
        <h2>Turn a subtitle into a useful expression.</h2>
        <p className="description">Draw a box around clear English, then review the text before analysis.</p>
        <button className="capture-button" onClick={capture} disabled={busy}>
          <span className="corners" aria-hidden="true" />
          {captureStatus === "selecting" ? "Draw on the page" : "Capture expression"}
        </button>
        <p className="shortcut">Press Esc on the page to cancel</p>
      </section>

      <section className="result" aria-live="polite">
        <div className="result-heading"><p className="step-label">02 · Confirm text</p><CaptureStatusPill status={captureStatus} progress={progress} /></div>
        {captureStatus === "idle" && <EmptyState />}
        {captureStatus === "selecting" && <p className="state-message">The page is ready. Drag around the expression you want to keep.</p>}
        {(captureStatus === "cropping" || captureStatus === "recognizing") && (
          <div className="working"><div className="scan-line" /><p>{captureStatus === "cropping" ? "Preparing the selected region…" : `Reading English… ${progress}%`}</p></div>
        )}
        {captureStatus === "error" && <div className="error"><p>{error}</p><button onClick={capture}>Try again</button></div>}
        {captureStatus === "done" && (
          <>
            <label htmlFor="detected-text">Review and edit</label>
            <textarea id="detected-text" value={text} onChange={(event) => updateText(event.target.value)} placeholder="No text was detected. You can type it here." autoFocus />
            <div className="text-actions">
              <button className="recapture" onClick={capture} disabled={busy}>Capture again</button>
              <button className="analyze-button" onClick={() => void analyzeInitial()} disabled={!text.trim() || busy}>
                {analysisStatus === "analyzing" ? "Analyzing…" : "Analyze expression"}
              </button>
            </div>
          </>
        )}
      </section>

      {(analysisStatus !== "idle" || analysis || candidateSession) && (
        <section className="analysis-section" aria-live="polite">
          <div className="result-heading"><p className="step-label">03 · Expression preview</p><span className={`status status-${analysisStatus}`}>{analysisStatus === "analyzing" ? "Thinking" : analysisStatus === "error" ? "Needs retry" : "Ready"}</span></div>
          {candidateSession && <CandidateSelector session={candidateSession} saveStates={candidateSaveStates} disabled={analysisStatus === "analyzing"} onSelect={(key) => void chooseCandidate(key)} />}
          {analysisStatus === "analyzing" && <div className="analysis-loading"><span /><p>{candidateSession ? "Completing this candidate’s analysis…" : "Finding the expression worth keeping…"}</p></div>}
          {analysisStatus === "error" && <div className="error"><p>{analysisError}</p><button onClick={retryAnalysis}>Try again</button></div>}
          {analysis && analysisStatus !== "analyzing" && <AnalysisPreview analysis={analysis} onSave={() => void savePrimary()} saveStatus={candidateSession ? candidateSaveStates[candidateSession.activeKey] ?? "idle" : "idle"} saveError={candidateSession ? candidateSaveErrors[candidateSession.activeKey] ?? "" : ""} />}
        </section>
      )}
      <SavedRecords records={savedRecords} error={recordsError} editingRecord={editingRecord} onEdit={setEditingRecord} onCancelEdit={() => setEditingRecord(null)} onSaveEdit={(record) => void saveEditedRecord(record)} onDelete={(record) => void removeSavedRecord(record)} />
      </> : <Library records={savedRecords} error={recordsError} editingRecord={editingRecord} onCapture={() => setActiveView("collect")} onEdit={setEditingRecord} onCancelEdit={() => setEditingRecord(null)} onSaveEdit={(record) => void saveEditedRecord(record)} onDelete={(record) => void removeSavedRecord(record)} />}
      <footer>Milestone 4 · Local library</footer>
    </main>
  );
}

function Library({ records, error, editingRecord, onCapture, onEdit, onCancelEdit, onSaveEdit, onDelete }: {
  records: ExpressionRecord[];
  error: string;
  editingRecord: ExpressionRecord | null;
  onCapture: () => void;
  onEdit: (record: ExpressionRecord) => void;
  onCancelEdit: () => void;
  onSaveEdit: (record: ExpressionRecord) => void;
  onDelete: (record: ExpressionRecord) => void;
}) {
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [grouped, setGrouped] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<"filtered" | "all">("filtered");
  const [exportPreset, setExportPreset] = useState<ExportPreset>("smart");
  const [exportMessage, setExportMessage] = useState("");
  const filtered = filterLibraryRecords(records, filters);
  const scenes = availableScenes(records);
  const semanticGroups = availableSemanticGroups(records);
  const updateFilter = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setExportMessage("");
  };
  const clearFilters = () => {
    setFilters(EMPTY_LIBRARY_FILTERS);
    setGrouped(false);
    setExportMessage("");
  };
  const exportRecords = exportScope === "filtered" ? filtered : filterLibraryRecords(records, EMPTY_LIBRARY_FILTERS);
  const runExport = () => {
    if (exportRecords.length === 0) {
      setExportMessage("No expressions to export.");
      return;
    }
    try {
      const html = generateStandaloneHtml(exportRecords, {
        filterSummary: exportScope === "filtered" ? buildFilterSummary(filters) : [],
        preset: exportPreset,
      });
      downloadHtmlFile(html, createExportFilename());
      setExportMessage(`Exported ${exportRecords.length} ${exportRecords.length === 1 ? "expression" : "expressions"}.`);
    } catch (exportError) {
      setExportMessage(exportError instanceof Error ? exportError.message : String(exportError));
    }
  };
  const renderRecord = (record: ExpressionRecord) => editingRecord?.id === record.id ? (
    <RecordEditor key={record.id} record={editingRecord} onCancel={onCancelEdit} onSave={onSaveEdit} />
  ) : (
    <LibraryRecord key={record.id} record={record} expanded={expandedId === record.id} onToggle={() => setExpandedId((current) => current === record.id ? null : record.id)} onEdit={() => onEdit(record)} onDelete={() => onDelete(record)} />
  );

  return (
    <section className="library-section" aria-labelledby="library-title">
      <div className="library-heading">
        <div><h2 id="library-title">Expression Library</h2><p>{filtered.length} of {records.length} expressions</p></div>
        <button className={grouped ? "group-active" : ""} onClick={() => setGrouped((value) => !value)} aria-pressed={grouped}>Group by meaning</button>
      </div>

      {error ? <div className="error compact-error"><p>{error}</p></div> : records.length === 0 ? (
        <div className="library-empty"><h3>Your library is ready.</h3><p>Capture and save an expression to begin your personal collection.</p><button onClick={onCapture}>Capture an expression</button></div>
      ) : <>
        <div className="library-filters">
          <label className="search-field" htmlFor="library-search"><span>Search</span><input id="library-search" type="search" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} placeholder="Expression, meaning, or sentence" /></label>
          <fieldset className="date-filter"><legend>Collected</legend><div>{(["all", "today", "this_week", "custom"] as DateFilter[]).map((value) => <button key={value} className={filters.date === value ? "filter-active" : ""} onClick={() => updateFilter("date", value)} aria-pressed={filters.date === value}>{value === "this_week" ? "This Week" : value === "custom" ? "Custom" : value[0].toUpperCase() + value.slice(1)}</button>)}</div></fieldset>
          {filters.date === "custom" && <div className="date-range"><label>From<input type="date" value={filters.customStart} onChange={(event) => updateFilter("customStart", event.target.value)} /></label><label>To<input type="date" value={filters.customEnd} min={filters.customStart || undefined} onChange={(event) => updateFilter("customEnd", event.target.value)} /></label></div>}
          <div className="category-filters">
            <label>Scene<select value={filters.scene} onChange={(event) => updateFilter("scene", event.target.value)}><option value="">All scenes</option>{scenes.map((scene) => <option key={scene}>{scene}</option>)}</select></label>
            <label>Semantic group<select value={filters.semanticGroup} onChange={(event) => updateFilter("semanticGroup", event.target.value)}><option value="">All meanings</option>{semanticGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
          </div>
          {(hasActiveLibraryFilters(filters) || grouped) && <button className="clear-filters" onClick={clearFilters}>Clear filters</button>}
        </div>

        <div className="export-bar">
          <div><strong>Export HTML</strong><span>Standalone, printable, and stored only on your device.</span></div>
          <button onClick={runExport} disabled={exportRecords.length === 0}>{exportRecords.length === 0 ? "No expressions to export" : "Export HTML"}</button>
          <div className="export-options">
            <label><span>Records</span><select value={exportScope} onChange={(event) => { setExportScope(event.target.value as "filtered" | "all"); setExportMessage(""); }}><option value="filtered">Filtered ({filtered.length})</option><option value="all">All ({records.length})</option></select></label>
            <label><span>Style</span><select value={exportPreset} onChange={(event) => { setExportPreset(event.target.value as ExportPreset); setExportMessage(""); }}><option value="smart">Smart</option><option value="full_notes">Full Notes</option><option value="compact_review">Compact Review</option></select></label>
          </div>
          {exportMessage && <p className={exportRecords.length === 0 ? "export-error" : "export-status"} role="status">{exportMessage}</p>}
        </div>

        {filtered.length === 0 ? <div className="no-results"><h3>No matching expressions.</h3><p>Try a different search or clear the active filters.</p><button onClick={clearFilters}>Clear filters</button></div> : grouped ? (
          <div className="semantic-groups">{groupRecordsBySemantic(filtered).map(([group, groupRecords]) => <section key={group}><div className="semantic-heading"><h3>{group.replaceAll("_", " ")}</h3><span>{groupRecords.length}</span></div>{groupRecords.map(renderRecord)}</section>)}</div>
        ) : <div className="library-list">{filtered.map(renderRecord)}</div>}
      </>}
    </section>
  );
}

function LibraryRecord({ record, expanded, onToggle, onEdit, onDelete }: { record: ExpressionRecord; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className={`library-record${expanded ? " record-expanded" : ""}`}>
      <button className="record-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="record-main"><strong>{record.expression}</strong><span>{record.meaningZh}</span><small>{record.originalSentence}</small></span>
        <span className="record-meta"><time dateTime={record.createdAt}>{formatDate(record.createdAt)}</time><span>{expanded ? "Close" : "Details"}</span></span>
      </button>
      <div className="record-tags">{record.sceneTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <p className="record-source">{sourceLabel(record)}</p>
      {expanded && <div className="record-detail">
        <DetailRow label="Sentence" value={record.originalSentence} />
        <DetailRow label="Translation" value={record.sentenceTranslationZh} />
        {record.ipa && <DetailRow label="IPA" value={record.ipa} />}
        <DetailRow label="In context" value={record.meaningInContextZh} />
        <DetailRow label="Usage" value={record.usageZh} />
        <DetailRow label="Semantic group" value={record.semanticGroup} />
        <DetailRow label="Naturalness" value={record.naturalness.replace("_", " ")} />
        {record.alternatives.length > 0 && <DetailRow label="Alternatives" value={record.alternatives.map((item) => `${item.expression}${item.meaningZh ? ` — ${item.meaningZh}` : ""}`).join("\n")} />}
        {record.sourceUrl && <a className="source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}
        <div className="record-actions"><button onClick={onEdit}>Edit</button><button className="delete-action" onClick={onDelete}>Delete</button></div>
      </div>}
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><p>{value}</p></div>;
}

function sourceLabel(record: ExpressionRecord) {
  if (record.sourceTitle) return record.sourceTitle;
  if (record.sourceType === "youtube") return "YouTube";
  if (record.sourceType === "web") return "Web page";
  if (record.sourceType === "image") return "Image";
  return "Source not recorded";
}

export function AnalysisPreview({ analysis, onSave, saveStatus, saveError }: { analysis: ExpressionAnalysis; onSave: () => void; saveStatus: SaveStatus; saveError: string }) {
  if (!analysis.has_useful_expression) {
    return <div className="no-expression"><p>No particularly useful spoken expression detected.</p><button disabled title="Saving is available in a later milestone">Save Anyway</button></div>;
  }
  return (
    <div className="preview-stack">
      <div className="source-sentence"><p>{analysis.sentence}</p><span>{analysis.sentence_translation_zh}</span></div>
      {analysis.primary_expression && <ExpressionCard expression={analysis.primary_expression} onSave={onSave} saveStatus={saveStatus} saveError={saveError} />}
    </div>
  );
}

function CandidateSelector({ session, saveStates, disabled, onSelect }: { session: CandidateSession; saveStates: Record<string, SaveStatus>; disabled: boolean; onSelect: (key: string) => void }) {
  return (
    <div className="candidate-selector" aria-label="Expression candidates">
      {session.candidates.map((candidate) => {
        const active = candidate.key === session.activeKey;
        return (
          <button key={candidate.key} className={active ? "candidate-active" : ""} onClick={() => onSelect(candidate.key)} disabled={disabled} aria-pressed={active}>
            <span className="candidate-star" aria-hidden="true">{active ? "★" : ""}</span>
            <span className="candidate-copy"><strong>{candidate.expression}</strong><small>{candidate.meaningZh}</small></span>
            {saveStates[candidate.key] === "saved" && <span className="candidate-saved">Saved</span>}
          </button>
        );
      })}
    </div>
  );
}

function ExpressionCard({ expression, onSave, saveStatus, saveError }: { expression: AnalyzedExpression; onSave: () => void; saveStatus: SaveStatus; saveError: string }) {
  return (
    <article className="expression-card">
      <div className="expression-top"><div><p className="expression-type">{expression.expression_type.replaceAll("_", " ")} · {expression.naturalness.replace("_", " ")}</p><h3>{expression.expression}</h3>{expression.ipa && <p className="ipa">{expression.ipa}</p>}</div><span className="semantic">{expression.semantic_group.replaceAll("_", " ")}</span></div>
      <p className="meaning">{expression.meaning_zh}</p>
      <p className="context">{expression.meaning_in_context_zh}</p>
      <div className="usage"><span>When to use it</span><p>{expression.usage_zh}</p></div>
      <div className="tags">{expression.scene_tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      {expression.alternatives.length > 0 && <div className="alternatives"><p>Similar expressions</p>{expression.alternatives.map((alternative) => <div key={alternative.expression}><strong>{alternative.expression}</strong><span>{alternative.meaning_zh}</span></div>)}</div>}
      <button className={`save-button save-${saveStatus}`} onClick={onSave} disabled={saveStatus === "saving" || saveStatus === "saved"}>
        {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved locally" : saveStatus === "error" ? "Try saving again" : "Save expression"}
      </button>
      {saveError && <p className="save-error">{saveError}</p>}
    </article>
  );
}

function SavedRecords({ records, error, editingRecord, onEdit, onCancelEdit, onSaveEdit, onDelete }: {
  records: ExpressionRecord[];
  error: string;
  editingRecord: ExpressionRecord | null;
  onEdit: (record: ExpressionRecord) => void;
  onCancelEdit: () => void;
  onSaveEdit: (record: ExpressionRecord) => void;
  onDelete: (record: ExpressionRecord) => void;
}) {
  const visibleRecords = records.slice(0, 5);
  return (
    <section className="saved-section" aria-live="polite">
      <div className="result-heading">
        <p className="step-label">04 · Saved locally</p>
        <span className="record-count">{records.length} {records.length === 1 ? "record" : "records"}</span>
      </div>
      {error && <div className="error compact-error"><p>{error}</p></div>}
      {!error && records.length === 0 && <p className="saved-empty">Saved expressions will remain here after the panel or browser is reopened.</p>}
      {visibleRecords.map((record) => editingRecord?.id === record.id ? (
        <RecordEditor key={record.id} record={editingRecord} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <article className="saved-row" key={record.id}>
          <div><strong>{record.expression}</strong><span>{record.meaningZh}</span><small>Updated {formatDate(record.updatedAt)}</small></div>
          <div className="saved-actions"><button onClick={() => onEdit(record)}>Edit</button><button className="delete-action" onClick={() => onDelete(record)}>Delete</button></div>
        </article>
      ))}
      {records.length > visibleRecords.length && <p className="saved-note">Showing the latest 5 records for Milestone 3 verification.</p>}
    </section>
  );
}

function RecordEditor({ record, onCancel, onSave }: { record: ExpressionRecord; onCancel: () => void; onSave: (record: ExpressionRecord) => void }) {
  const [draft, setDraft] = useState(record);
  const [sceneTags, setSceneTags] = useState(record.sceneTags.join(", "));
  const [alternatives, setAlternatives] = useState(record.alternatives.map((item) => `${item.expression}${item.meaningZh ? ` | ${item.meaningZh}` : ""}`).join("\n"));
  const update = <K extends keyof ExpressionRecord>(key: K, value: ExpressionRecord[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => onSave({
    ...draft,
    sceneTags: sceneTags.split(",").map((tag) => tag.trim()).filter(Boolean),
    alternatives: alternatives.split("\n").map((line) => {
      const [expression, ...meaning] = line.split("|");
      const meaningZh = meaning.join("|").trim();
      return { expression: expression.trim(), ...(meaningZh ? { meaningZh } : {}) };
    }).filter((item) => item.expression),
  });
  return (
    <div className="record-editor">
      <label>Original sentence<input value={draft.originalSentence} onChange={(event) => update("originalSentence", event.target.value)} /></label>
      <label>Sentence translation<input value={draft.sentenceTranslationZh} onChange={(event) => update("sentenceTranslationZh", event.target.value)} /></label>
      <label>Expression<input required value={draft.expression} onChange={(event) => update("expression", event.target.value)} /></label>
      <label>IPA<input value={draft.ipa ?? ""} onChange={(event) => update("ipa", event.target.value || undefined)} /></label>
      <label>Chinese meaning<input value={draft.meaningZh} onChange={(event) => update("meaningZh", event.target.value)} /></label>
      <label>Context meaning<textarea value={draft.meaningInContextZh} onChange={(event) => update("meaningInContextZh", event.target.value)} /></label>
      <label>Usage<textarea value={draft.usageZh} onChange={(event) => update("usageZh", event.target.value)} /></label>
      <div className="editor-pair">
        <label>Type<select value={draft.expressionType} onChange={(event) => update("expressionType", event.target.value as ExpressionRecord["expressionType"])}>{RECORD_EXPRESSION_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Naturalness<select value={draft.naturalness} onChange={(event) => update("naturalness", event.target.value as ExpressionRecord["naturalness"])}>{RECORD_NATURALNESS_VALUES.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label>Semantic group<input value={draft.semanticGroup} onChange={(event) => update("semanticGroup", event.target.value)} /></label>
      <label>Scene tags <small>comma separated</small><input value={sceneTags} onChange={(event) => setSceneTags(event.target.value)} /></label>
      <label>Alternatives <small>one per line: expression | meaning</small><textarea value={alternatives} onChange={(event) => setAlternatives(event.target.value)} /></label>
      <div className="editor-actions"><button onClick={onCancel}>Cancel</button><button className="editor-save" onClick={submit} disabled={!draft.expression.trim()}>Save changes</button></div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function cleanText(value: string) {
  return value.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function EmptyState() {
  return <div className="empty"><div className="empty-lines" aria-hidden="true"><i /><i /><i /></div><p>Your detected sentence will appear here.</p></div>;
}

function CaptureStatusPill({ status, progress }: { status: CaptureStatus; progress: number }) {
  const label = status === "recognizing" ? `${progress}%` : status === "done" ? "Editable" : status === "error" ? "Needs retry" : status === "selecting" ? "Selecting" : status === "cropping" ? "Preparing" : "Waiting";
  return <span className={`status status-${status}`}>{label}</span>;
}
