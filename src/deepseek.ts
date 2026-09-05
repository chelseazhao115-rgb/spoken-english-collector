import {
  ANALYSIS_INSTRUCTIONS,
  expressionAnalysisJsonSchema,
  validateExpressionAnalysis,
  type ExpressionAnalysis,
} from "./ai";

interface ResponsesApiResult {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
}

export const DEEPSEEK_RESPONSES_ENDPOINT = "https://api.deepseek.com/responses";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const MAX_OUTPUT_TOKENS = 3500;

export interface AnalysisTimings {
  apiRequestLatencyMs: number;
  structuredResponseMs: number;
  schemaValidationMs: number;
  backendTotalMs: number;
  attempts: 1 | 2;
}

export interface TimedAnalysis {
  data: ExpressionAnalysis;
  timings: AnalysisTimings;
}

export async function analyzeExpression(apiKey: string, sentence: string, targetExpression?: string): Promise<TimedAnalysis> {
  const overallStarted = performance.now();
  let accumulatedRequestMs = 0;
  let accumulatedStructuredMs = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await requestAnalysis(apiKey, sentence, targetExpression);
      accumulatedRequestMs += result.timings.apiRequestLatencyMs;
      accumulatedStructuredMs += result.timings.structuredResponseMs;
      return {
        data: result.data,
        timings: {
          ...result.timings,
          apiRequestLatencyMs: accumulatedRequestMs,
          structuredResponseMs: accumulatedStructuredMs,
          backendTotalMs: performance.now() - overallStarted,
          attempts: attempt as 1 | 2,
        },
      };
    } catch (error) {
      if (error instanceof StructuredOutputError && error.timings) {
        accumulatedRequestMs += error.timings.apiRequestLatencyMs;
        accumulatedStructuredMs += error.timings.structuredResponseMs;
      }
      if (!(error instanceof StructuredOutputError) || attempt === 2) throw error;
    }
  }
  throw new Error("The analysis request did not complete.");
}

async function requestAnalysis(apiKey: string, sentence: string, targetExpression?: string): Promise<TimedAnalysis> {
  const started = performance.now();
  const response = await fetch(DEEPSEEK_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: "minimal" },
      instructions: targetExpression
        ? `${ANALYSIS_INSTRUCTIONS}\nThe user explicitly selected the requested word or phrase for learning. Always set has_useful_expression to true and return its complete analysis as primary_expression, even when it is an ordinary word. Return no secondary candidates.`
        : ANALYSIS_INSTRUCTIONS,
      input: targetExpression
        ? `Sentence: ${sentence}\nRequested expression: ${targetExpression}`
        : `Analyze this sentence exactly as written:\n${sentence}`,
      text: {
        format: {
          type: "json_schema",
          name: "spoken_expression_analysis",
          strict: true,
          schema: expressionAnalysisJsonSchema,
        },
      },
    }),
  });

  const apiRequestLatencyMs = performance.now() - started;
  let body: ResponsesApiResult;
  try {
    body = await readResponse(response);
  } catch (error) {
    if (response.ok) throw structuredError(error instanceof Error ? error.message : String(error), started, apiRequestLatencyMs);
    throw error;
  }
  const structuredResponseMs = performance.now() - started;
  if (!response.ok) throw new Error(body.error?.message || `AI API returned HTTP ${response.status}.`);
  const content = body.output?.flatMap((item) => item.content ?? []) ?? [];
  const refusal = content.find((item) => item.type === "refusal")?.refusal;
  if (refusal) throw new Error(`The model declined this request: ${refusal}`);
  const outputText = content.find((item) => item.type === "output_text")?.text;
  if (!outputText) throw structuredError("AI returned no structured output.", started, apiRequestLatencyMs);

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw structuredError(`AI returned invalid JSON (${outputText.length} characters, starts with ${JSON.stringify(outputText.slice(0, 1))}, ends with ${JSON.stringify(outputText.slice(-1))}).`, started, apiRequestLatencyMs);
  }
  const validationStarted = performance.now();
  let data: ExpressionAnalysis;
  try {
    data = validateExpressionAnalysis(parsed);
  } catch (error) {
    throw structuredError(error instanceof Error ? error.message : String(error), started, apiRequestLatencyMs);
  }
  if (targetExpression && (!data.has_useful_expression || !data.primary_expression)) {
    throw structuredError("AI did not return a complete analysis for the selected target.", started, apiRequestLatencyMs);
  }
  const schemaValidationMs = performance.now() - validationStarted;
  return {
    data,
    timings: {
      apiRequestLatencyMs,
      structuredResponseMs,
      schemaValidationMs,
      backendTotalMs: performance.now() - started,
      attempts: 1,
    },
  };
}

class StructuredOutputError extends Error {
  timings?: Pick<AnalysisTimings, "apiRequestLatencyMs" | "structuredResponseMs">;
}

function structuredError(message: string, started: number, apiRequestLatencyMs: number) {
  const error = new StructuredOutputError(message);
  error.timings = {
    apiRequestLatencyMs,
    structuredResponseMs: performance.now() - started,
  };
  return error;
}

async function readResponse(response: Response): Promise<ResponsesApiResult> {
  try {
    return await response.json() as ResponsesApiResult;
  } catch {
    throw new Error(`AI API returned an unreadable response (HTTP ${response.status}).`);
  }
}
