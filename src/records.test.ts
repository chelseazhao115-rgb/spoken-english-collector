import { describe, expect, it } from "vitest";
import type { ExpressionAnalysis } from "./ai";
import { buildExpressionRecord } from "./records";

const analysis: ExpressionAnalysis = {
  sentence: "I wouldn't read too much into it.",
  sentence_translation_zh: "我不会对此过度解读。",
  has_useful_expression: true,
  primary_expression: {
    expression: "read too much into something",
    ipa: "",
    meaning_zh: "对某事过度解读",
    meaning_in_context_zh: "这里表示不要赋予小事过多意义。",
    usage_zh: "用于提醒别人不要过度分析。",
    naturalness: "very_natural",
    expression_type: "idiomatic_phrase",
    semantic_group: "OVERINTERPRET",
    scene_tags: ["Daily Conversation", "Opinions"],
    alternatives: [{ expression: "Don't overthink it.", meaning_zh: "别想太多。" }],
  },
  secondary_candidates: [{ expression: "in doubt", meaning_zh: "不确定" }],
};

describe("buildExpressionRecord", () => {
  it("maps only the fully analyzed primary expression to the persistence schema", () => {
    const record = buildExpressionRecord(analysis, {
      sourceType: "youtube",
      sourceTitle: "A video",
      sourceUrl: "https://www.youtube.com/watch?v=abc",
      capturedAt: "2026-09-05T08:00:00.000Z",
    }, "2026-09-05T08:01:00.000Z", "record-1");

    expect(record).toMatchObject({
      id: "record-1",
      expression: "read too much into something",
      expressionType: "idiom",
      sourceType: "youtube",
      capturedAt: "2026-09-05T08:00:00.000Z",
      createdAt: "2026-09-05T08:01:00.000Z",
      updatedAt: "2026-09-05T08:01:00.000Z",
      userEdited: false,
    });
    expect(record).not.toHaveProperty("secondary_candidates");
    expect(record).not.toHaveProperty("imageDataUrl");
  });

  it("rejects an analysis without a full primary expression", () => {
    expect(() => buildExpressionRecord({ ...analysis, has_useful_expression: false, primary_expression: null, secondary_candidates: [] }, {
      sourceType: "other",
      capturedAt: "2026-09-05T08:00:00.000Z",
    })).toThrow("Only a fully analyzed primary expression can be saved");
  });
});
