import { describe, expect, it } from "vitest";
import type { ExpressionAnalysis } from "./ai";
import { activeCandidateAnalysis, cacheCandidateAnalysis, createCandidateSession, selectCandidate } from "./candidates";

const initial: ExpressionAnalysis = {
  sentence: "It looked like a piece of cake, but it was easier said than done—the examples were only the tip of the iceberg.",
  sentence_translation_zh: "它看起来轻而易举，但做起来没那么简单，那些例子只是冰山一角。",
  has_useful_expression: true,
  primary_expression: details("a piece of cake", "轻而易举的事"),
  secondary_candidates: [
    { expression: "easier said than done", meaning_zh: "说起来容易做起来难" },
    { expression: "the tip of the iceberg", meaning_zh: "冰山一角" },
  ],
};

function details(expression: string, meaning: string) {
  return {
    expression,
    ipa: "",
    meaning_zh: meaning,
    meaning_in_context_zh: meaning,
    usage_zh: "用于日常口语。",
    naturalness: "very_natural" as const,
    expression_type: "idiom" as const,
    semantic_group: "IDIOM",
    scene_tags: ["Daily Conversation"],
    alternatives: [],
  };
}

describe("candidate analysis session", () => {
  it("preserves all candidates while caching targeted full analyses", () => {
    const session = createCandidateSession(initial)!;
    const selected = selectCandidate(session, "easier said than done");
    expect(activeCandidateAnalysis(selected)).toBeNull();

    const completed = cacheCandidateAnalysis(selected, "easier said than done", {
      ...initial,
      primary_expression: details("easier said than done", "说起来容易做起来难"),
      secondary_candidates: [],
    });
    expect(completed.candidates).toHaveLength(3);
    expect(activeCandidateAnalysis(completed)?.primary_expression?.expression).toBe("easier said than done");

    const backToPrimary = selectCandidate(completed, "a piece of cake");
    expect(activeCandidateAnalysis(backToPrimary)?.primary_expression?.expression).toBe("a piece of cake");
    expect(backToPrimary.candidates).toHaveLength(3);
  });
});
