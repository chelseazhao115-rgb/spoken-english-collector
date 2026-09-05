import { analyzeExpression } from "./deepseek";
import type { AnalysisResponse, ExtensionMessage } from "./messages";

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === "START_CAPTURE") {
    void startCapture();
    return;
  }

  if (message.type === "SELECTION_COMPLETE" && sender.tab?.windowId !== undefined) {
    void finishCapture(message, sender.tab);
  }

  if (message.type === "ANALYZE_EXPRESSION") {
    void handleAnalysis(message.text, message.targetExpression).then(sendResponse);
    return true;
  }
});

async function handleAnalysis(text: string, targetExpression?: string): Promise<AnalysisResponse> {
  try {
    const sentence = text.trim();
    if (!sentence) throw new Error("Enter or capture a sentence before analyzing.");
    const settings = await chrome.storage.local.get("aiApiKey");
    const apiKey = typeof settings.aiApiKey === "string" ? settings.aiApiKey.trim() : "";
    if (!apiKey) throw new Error("Add an AI API key before analyzing.");
    const result = await analyzeExpression(apiKey, sentence, targetExpression);
    return { ok: true, data: result.data, timings: result.timings };
  } catch (error) {
    console.error("Expression analysis failed:", error);
    return { ok: false, error: errorMessage(error) };
  }
}

async function startCapture() {
  let stage = "find the active tab";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Open a regular webpage before capturing.");
    if (!isSupportedPage(tab.url)) {
      throw new Error(`Unsupported page: ${tab.url ?? "unknown URL"}`);
    }

    stage = "start the page selection";
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "START_CAPTURE" } satisfies ExtensionMessage);
    } catch (error) {
      if (!isMissingContentScript(error)) throw error;
      // Tabs that were already open when the extension was installed/reloaded do not
      // receive declarative content scripts until their next navigation.
      stage = "attach the page selection helper";
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["assets/content.js"] });
      stage = "start the page selection";
      await chrome.tabs.sendMessage(tab.id, { type: "START_CAPTURE" } satisfies ExtensionMessage);
    }
    await chrome.runtime.sendMessage({ type: "CAPTURE_STARTED" } satisfies ExtensionMessage);
  } catch (error) {
    console.error(`Capture failed while trying to ${stage}:`, error);
    await chrome.runtime.sendMessage({
      type: "CAPTURE_ERROR",
      message: `Could not ${stage}: ${errorMessage(error)}`,
    } satisfies ExtensionMessage);
  }
}

async function finishCapture(
  message: Extract<ExtensionMessage, { type: "SELECTION_COMPLETE" }>,
  tab: chrome.tabs.Tab,
) {
  try {
    // The content script removes its overlay before this message, so selection UI is never captured.
    const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    await chrome.runtime.sendMessage({
      type: "CAPTURE_READY",
      imageDataUrl,
      rect: message.rect,
      viewportWidth: message.viewportWidth,
      viewportHeight: message.viewportHeight,
      source: captureSource(tab),
    } satisfies ExtensionMessage);
  } catch (error) {
    console.error("captureVisibleTab failed:", error);
    await chrome.runtime.sendMessage({
      type: "CAPTURE_ERROR",
      message: `Could not capture the visible tab: ${errorMessage(error)}`,
    } satisfies ExtensionMessage);
  }
}

function captureSource(tab: chrome.tabs.Tab) {
  const capturedAt = new Date().toISOString();
  if (!tab.url) return { sourceType: "other" as const, capturedAt };
  try {
    const url = new URL(tab.url);
    const youtube = url.hostname === "youtu.be" || url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com");
    const timestamp = youtube ? url.searchParams.get("t") ?? undefined : undefined;
    return {
      sourceType: youtube ? "youtube" as const : "web" as const,
      ...(tab.title ? { sourceTitle: tab.title } : {}),
      sourceUrl: tab.url,
      ...(timestamp ? { sourceTimestamp: timestamp } : {}),
      capturedAt,
    };
  } catch {
    return { sourceType: "other" as const, capturedAt };
  }
}

function isSupportedPage(url?: string) {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isMissingContentScript(error: unknown) {
  const message = errorMessage(error);
  return message.includes("Receiving end does not exist")
    || message.includes("Could not establish connection");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
