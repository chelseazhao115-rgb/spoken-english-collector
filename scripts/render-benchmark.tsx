import React from "react";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";
import { AnalysisPreview } from "../src/App";
import type { ExpressionAnalysis } from "../src/ai";

const sample: ExpressionAnalysis = {
  sentence: "Give it a shot and see how it goes.",
  sentence_translation_zh: "试试看，然后看看效果如何。",
  has_useful_expression: true,
  primary_expression: {
    expression: "give it a shot",
    ipa: "",
    meaning_zh: "试一试",
    meaning_in_context_zh: "这里表示建议对方先尝试一下。",
    usage_zh: "鼓励别人尝试某件事时使用。",
    naturalness: "very_natural",
    expression_type: "idiomatic_phrase",
    semantic_group: "TRY_SOMETHING",
    scene_tags: ["Daily Conversation", "Encouragement"],
    alternatives: [
      { expression: "give it a try", meaning_zh: "试试看" },
      { expression: "have a go", meaning_zh: "尝试一下" },
    ],
  },
  secondary_candidates: [{ expression: "see how it goes", meaning_zh: "看看进展如何" }],
};

const rootElement = document.getElementById("root")!;
const started = performance.now();
const root = ReactDOM.createRoot(rootElement);
flushSync(() => {
  root.render(<AnalysisPreview analysis={sample} onSelectSecondary={() => undefined} />);
});
document.body.dataset.renderMs = (performance.now() - started).toFixed(2);
