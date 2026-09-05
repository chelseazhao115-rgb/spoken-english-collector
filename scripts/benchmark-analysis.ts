import { analyzeExpression } from "../src/deepseek";

const apiKey = process.env.BENCHMARK_API_KEY;
if (!apiKey) throw new Error("BENCHMARK_API_KEY is required.");

const defaultInputs = [
  "I wouldn't read too much into it.",
  "I'm still on the fence about moving abroad.",
  "Give it a shot and see how it goes.",
  "Work has been hectic, but I'm hanging in there.",
  "The book is on the table.",
];
const inputs = process.env.BENCHMARK_INPUT ? [process.env.BENCHMARK_INPUT] : defaultInputs;

const times: number[] = [];
const requestTimes: number[] = [];
const responseTimes: number[] = [];
const validationTimes: number[] = [];
for (const input of inputs) {
  try {
    const result = await analyzeExpression(apiKey, input, process.env.BENCHMARK_TARGET);
    const duration = result.timings.backendTotalMs;
    times.push(duration);
    requestTimes.push(result.timings.apiRequestLatencyMs);
    responseTimes.push(result.timings.structuredResponseMs);
    validationTimes.push(result.timings.schemaValidationMs);
    console.log(JSON.stringify({
      input,
      ...rounded(result.timings),
      useful: result.data.has_useful_expression,
      primary: result.data.primary_expression?.expression ?? null,
      secondary: result.data.secondary_candidates.map((item) => item.expression),
    }));
  } catch (error) {
    console.log(JSON.stringify({ input, error: error instanceof Error ? error.message : String(error) }));
  }
}

console.log(JSON.stringify({
  successful: times.length,
  averageMs: times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : null,
  slowestMs: times.length ? Math.round(Math.max(...times)) : null,
  averageApiRequestMs: average(requestTimes),
  averageStructuredResponseMs: average(responseTimes),
  averageValidationMs: average(validationTimes),
}));

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function rounded<T extends Record<string, number>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number)]));
}
