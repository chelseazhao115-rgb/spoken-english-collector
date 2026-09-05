import type { ExpressionAnalysis } from "./ai";

export const RECORD_EXPRESSION_TYPES = [
  "idiom",
  "collocation",
  "phrasal_verb",
  "sentence_pattern",
  "conversational_phrase",
  "word",
  "other",
] as const;

export const RECORD_NATURALNESS_VALUES = ["very_natural", "natural", "neutral"] as const;

export interface CaptureSource {
  sourceType: "youtube" | "web" | "image" | "other";
  sourceTitle?: string;
  sourceUrl?: string;
  sourceTimestamp?: string;
  capturedAt: string;
}

export interface ExpressionRecord {
  id: string;
  originalSentence: string;
  sentenceTranslationZh: string;
  expression: string;
  ipa?: string;
  meaningZh: string;
  meaningInContextZh: string;
  usageZh: string;
  expressionType: typeof RECORD_EXPRESSION_TYPES[number];
  naturalness: typeof RECORD_NATURALNESS_VALUES[number];
  semanticGroup: string;
  sceneTags: string[];
  alternatives: { expression: string; meaningZh?: string }[];
  sourceType: CaptureSource["sourceType"];
  sourceTitle?: string;
  sourceUrl?: string;
  sourceTimestamp?: string;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  userEdited: boolean;
}

export function buildExpressionRecord(
  analysis: ExpressionAnalysis,
  source: CaptureSource,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): ExpressionRecord {
  const primary = analysis.primary_expression;
  if (!analysis.has_useful_expression || !primary) {
    throw new Error("Only a fully analyzed primary expression can be saved.");
  }

  return {
    id,
    originalSentence: analysis.sentence,
    sentenceTranslationZh: analysis.sentence_translation_zh,
    expression: primary.expression,
    ...(primary.ipa ? { ipa: primary.ipa } : {}),
    meaningZh: primary.meaning_zh,
    meaningInContextZh: primary.meaning_in_context_zh,
    usageZh: primary.usage_zh,
    expressionType: normalizeExpressionType(primary.expression_type),
    naturalness: primary.naturalness,
    semanticGroup: primary.semantic_group,
    sceneTags: [...primary.scene_tags],
    alternatives: primary.alternatives.map((item) => ({
      expression: item.expression,
      ...(item.meaning_zh ? { meaningZh: item.meaning_zh } : {}),
    })),
    sourceType: source.sourceType,
    ...(source.sourceTitle ? { sourceTitle: source.sourceTitle } : {}),
    ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
    ...(source.sourceTimestamp ? { sourceTimestamp: source.sourceTimestamp } : {}),
    capturedAt: source.capturedAt,
    createdAt: now,
    updatedAt: now,
    userEdited: false,
  };
}

function normalizeExpressionType(type: NonNullable<ExpressionAnalysis["primary_expression"]>["expression_type"]): ExpressionRecord["expressionType"] {
  if (type === "idiomatic_phrase") return "idiom";
  if (type === "natural_spoken_expression") return "conversational_phrase";
  return type;
}
