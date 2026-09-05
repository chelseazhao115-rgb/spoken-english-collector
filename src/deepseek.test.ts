import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeExpression } from "./deepseek";

const validAnalysis = {
  sentence: "skincare",
  sentence_translation_zh: "护肤",
  has_useful_expression: true,
  primary_expression: {
    expression: "skincare",
    ipa: "/ˈskɪnker/",
    meaning_zh: "护肤",
    meaning_in_context_zh: "指护理皮肤。",
    usage_zh: "常用于谈论护肤步骤或产品。",
    naturalness: "natural",
    expression_type: "word",
    semantic_group: "SKIN_CARE",
    scene_tags: ["Daily Conversation"],
    alternatives: [],
  },
  secondary_candidates: [],
};

function apiResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function structuredResponse(value: unknown = validAnalysis) {
  return apiResponse({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}

afterEach(() => vi.restoreAllMocks());

describe("DeepSeek structured output retry", () => {
  it("retries once after missing structured output and then succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(apiResponse({ output: [] }))
      .mockResolvedValueOnce(structuredResponse());
    const result = await analyzeExpression("key", "skincare", "skincare");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.timings.attempts).toBe(2);
    expect(result.data.primary_expression?.expression_type).toBe("word");
  });

  it("stops after the second invalid structured response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => apiResponse({ output: [] }));
    await expect(analyzeExpression("key", "skincare", "skincare")).rejects.toThrow("AI returned no structured output");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an HTTP error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(apiResponse({ error: { message: "Unauthorized" } }, 401));
    await expect(analyzeExpression("key", "skincare", "skincare")).rejects.toThrow("Unauthorized");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marks an explicit target as mandatory full analysis in the request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(structuredResponse());
    await analyzeExpression("key", "skincare", "skincare");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.instructions).toContain("Always set has_useful_expression to true");
    expect(body.input).toContain("Requested expression: skincare");
  });

  it("retries when a targeted lookup incorrectly returns no expression", async () => {
    const noExpression = {
      sentence: "skincare",
      sentence_translation_zh: "护肤",
      has_useful_expression: false,
      primary_expression: null,
      secondary_candidates: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(structuredResponse(noExpression))
      .mockResolvedValueOnce(structuredResponse());
    const result = await analyzeExpression("key", "skincare", "skincare");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.timings.attempts).toBe(2);
    expect(result.data.has_useful_expression).toBe(true);
  });
});
