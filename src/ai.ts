export const EXPRESSION_TYPES = [
  "idiom",
  "idiomatic_phrase",
  "collocation",
  "phrasal_verb",
  "conversational_phrase",
  "sentence_pattern",
  "natural_spoken_expression",
  "word",
  "other",
] as const;

export const NATURALNESS_VALUES = ["very_natural", "natural", "neutral"] as const;

export interface AlternativeExpression {
  expression: string;
  meaning_zh: string;
}

export interface AnalyzedExpression {
  expression: string;
  ipa: string;
  meaning_zh: string;
  meaning_in_context_zh: string;
  usage_zh: string;
  naturalness: typeof NATURALNESS_VALUES[number];
  expression_type: typeof EXPRESSION_TYPES[number];
  semantic_group: string;
  scene_tags: string[];
  alternatives: AlternativeExpression[];
}

export interface SecondaryCandidate {
  expression: string;
  meaning_zh: string;
}

export interface ExpressionAnalysis {
  sentence: string;
  sentence_translation_zh: string;
  has_useful_expression: boolean;
  primary_expression: AnalyzedExpression | null;
  secondary_candidates: SecondaryCandidate[];
}

const stringSchema = { type: "string" } as const;

export const expressionAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sentence", "sentence_translation_zh", "has_useful_expression", "primary_expression", "secondary_candidates"],
  properties: {
    sentence: stringSchema,
    sentence_translation_zh: stringSchema,
    has_useful_expression: { type: "boolean" },
    primary_expression: {
      anyOf: [{
        type: "object",
        additionalProperties: false,
        required: [
          "expression", "ipa", "meaning_zh", "meaning_in_context_zh", "usage_zh",
          "naturalness", "expression_type", "semantic_group", "scene_tags", "alternatives",
        ],
        properties: {
          expression: stringSchema,
          ipa: stringSchema,
          meaning_zh: stringSchema,
          meaning_in_context_zh: { type: "string", maxLength: 120 },
          usage_zh: { type: "string", maxLength: 220 },
          naturalness: { type: "string", enum: NATURALNESS_VALUES },
          expression_type: { type: "string", enum: EXPRESSION_TYPES },
          semantic_group: stringSchema,
          scene_tags: { type: "array", maxItems: 3, items: stringSchema },
          alternatives: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["expression", "meaning_zh"],
              properties: { expression: stringSchema, meaning_zh: stringSchema },
            },
          },
        },
      }, { type: "null" }],
    },
    secondary_candidates: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["expression", "meaning_zh"],
        properties: { expression: stringSchema, meaning_zh: stringSchema },
      },
    },
  },
} as const;

export const ANALYSIS_INSTRUCTIONS = `You identify useful, natural spoken-English expressions for an intermediate English learner.
Return at most three candidates, ranked by spoken-English learning value. Prefer idioms, collocations, phrasal verbs, conversational phrases, sentence patterns, and natural spoken chunks.
Do not fill a quota. Do not extract ordinary words, generic verb phrases (for example "move abroad"), weak fragments, or phrases without independent reusable spoken value. If in doubt, omit the candidate. If only one candidate is valuable, return only one. Canonicalize each expression into a reusable form.
Put the highest-value candidate in primary_expression with full analysis. Put at most two others in secondary_candidates with only expression and meaning_zh.
Write translations, meanings, context explanations, and usage guidance in concise Simplified Chinese.
Use an uppercase English semantic_group describing meaning, such as OVERINTERPRET or UNCERTAIN_DECISION.
Use clear English scene_tags such as Daily Conversation, Work, Relationships, Travel, Emotions, or Opinions.
Give at most three genuinely close alternatives and at most three scene_tags. Keep meaning_in_context_zh to one sentence and usage_zh to one or two sentences. Avoid repeated explanations.
Use an empty IPA string when IPA is not useful for a phrase.
If nothing is especially worth collecting, set has_useful_expression to false, primary_expression to null, and secondary_candidates to an empty array.`;

export function validateExpressionAnalysis(value: unknown): ExpressionAnalysis {
  if (!isRecord(value)) throw new Error("AI response is not an object.");
  requireExactKeys(value, ["sentence", "sentence_translation_zh", "has_useful_expression", "primary_expression", "secondary_candidates"]);
  requireString(value.sentence, "sentence");
  requireString(value.sentence_translation_zh, "sentence_translation_zh");
  if (typeof value.has_useful_expression !== "boolean") throw new Error("has_useful_expression must be boolean.");
  if (!Array.isArray(value.secondary_candidates)) throw new Error("secondary_candidates must be an array.");
  if (value.secondary_candidates.length > 2) throw new Error("At most two secondary candidates are allowed.");
  if (value.has_useful_expression && value.primary_expression === null) throw new Error("Useful analysis must include a primary expression.");
  if (!value.has_useful_expression && (value.primary_expression !== null || value.secondary_candidates.length !== 0)) throw new Error("No-expression analysis must not include candidates.");
  if (value.primary_expression !== null) validateExpression(value.primary_expression, "primary_expression");
  value.secondary_candidates.forEach((item, index) => validateSecondary(item, index));
  return value as unknown as ExpressionAnalysis;
}

function validateExpression(value: unknown, path: string) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const keys = ["expression", "ipa", "meaning_zh", "meaning_in_context_zh", "usage_zh", "naturalness", "expression_type", "semantic_group", "scene_tags", "alternatives"];
  requireExactKeys(value, keys);
  ["expression", "ipa", "meaning_zh", "meaning_in_context_zh", "usage_zh", "semantic_group"].forEach((key) => requireString(value[key], `${path}.${key}`));
  if (!NATURALNESS_VALUES.includes(value.naturalness as never)) throw new Error(`Invalid naturalness at ${path}.`);
  if (!EXPRESSION_TYPES.includes(value.expression_type as never)) throw new Error(`Invalid expression_type at ${path}.`);
  if (!Array.isArray(value.scene_tags) || value.scene_tags.length > 3 || !value.scene_tags.every((tag) => typeof tag === "string")) throw new Error(`Invalid scene_tags at ${path}.`);
  if (!Array.isArray(value.alternatives) || value.alternatives.length > 3) throw new Error(`Invalid alternatives at ${path}.`);
  value.alternatives.forEach((alternative, alternativeIndex) => {
    if (!isRecord(alternative)) throw new Error(`Invalid alternative at ${path}.alternatives[${alternativeIndex}].`);
    requireExactKeys(alternative, ["expression", "meaning_zh"]);
    requireString(alternative.expression, "alternative.expression");
    requireString(alternative.meaning_zh, "alternative.meaning_zh");
  });
}

function validateSecondary(value: unknown, index: number) {
  if (!isRecord(value)) throw new Error(`secondary_candidates[${index}] must be an object.`);
  requireExactKeys(value, ["expression", "meaning_zh"]);
  requireString(value.expression, `secondary_candidates[${index}].expression`);
  requireString(value.meaning_zh, `secondary_candidates[${index}].meaning_zh`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string) {
  if (typeof value !== "string") throw new Error(`${path} must be a string.`);
}

function requireExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`AI response contains missing or unexpected fields (received: ${actual.join(", ")}).`);
  }
}
