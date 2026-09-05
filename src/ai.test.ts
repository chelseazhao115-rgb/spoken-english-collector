import { describe, expect, it } from "vitest";
import { validateExpressionAnalysis } from "./ai";

const usefulResult = {
  sentence: "I wouldn't read too much into it.",
  sentence_translation_zh: "我不会对此过度解读。",
  has_useful_expression: true,
  primary_expression: {
    expression: "read too much into something",
    ipa: "",
    meaning_zh: "对某件事过度解读",
    meaning_in_context_zh: "这里表示不要赋予这件事过多意义。",
    usage_zh: "当别人对一句话、一个行为或小事分析过度时使用。",
    naturalness: "very_natural",
    expression_type: "idiomatic_phrase",
    semantic_group: "OVERINTERPRET",
    scene_tags: ["Daily Conversation", "Opinions"],
    alternatives: [
      { expression: "Don't overthink it.", meaning_zh: "别想太多。" },
      { expression: "Don't make too much of it.", meaning_zh: "别把它看得太重。" },
    ],
  },
  secondary_candidates: [
    { expression: "Don't overthink it.", meaning_zh: "别想太多。" },
  ],
};

describe("validateExpressionAnalysis", () => {
  it("accepts a complete useful-expression result", () => {
    expect(validateExpressionAnalysis(usefulResult)).toEqual(usefulResult);
  });

  it("accepts the no-useful-expression state", () => {
    const result = {
      sentence: "The book is on the table.",
      sentence_translation_zh: "书在桌子上。",
      has_useful_expression: false,
      primary_expression: null,
      secondary_candidates: [],
    };
    expect(validateExpressionAnalysis(result)).toEqual(result);
  });

  it("rejects extra fields instead of silently accepting schema drift", () => {
    expect(() => validateExpressionAnalysis({ ...usefulResult, commentary: "extra" })).toThrow(/missing or unexpected/i);
  });

  it("rejects inconsistent false results", () => {
    expect(() => validateExpressionAnalysis({ ...usefulResult, has_useful_expression: false })).toThrow(/must not include candidates/i);
  });

  it("rejects unknown expression types", () => {
    const invalid = structuredClone(usefulResult);
    invalid.primary_expression.expression_type = "basic_vocabulary";
    expect(() => validateExpressionAnalysis(invalid)).toThrow(/expression_type/i);
  });

  it("rejects more than two secondary candidates", () => {
    const invalid = structuredClone(usefulResult);
    invalid.secondary_candidates.push(
      { expression: "Don't make too much of it.", meaning_zh: "别看得太重。" },
      { expression: "Let it go.", meaning_zh: "别再纠结。" },
    );
    expect(() => validateExpressionAnalysis(invalid)).toThrow(/at most two/i);
  });
});
