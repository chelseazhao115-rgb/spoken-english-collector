export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

import type { CaptureSource } from "./records";

export type ExtensionMessage =
  | { type: "START_CAPTURE" }
  | { type: "CAPTURE_STARTED" }
  | { type: "CAPTURE_CANCELLED" }
  | { type: "CAPTURE_ERROR"; message: string }
  | {
      type: "SELECTION_COMPLETE";
      rect: SelectionRect;
      viewportWidth: number;
      viewportHeight: number;
    }
  | {
      type: "CAPTURE_READY";
      imageDataUrl: string;
      rect: SelectionRect;
      viewportWidth: number;
      viewportHeight: number;
      source: CaptureSource;
    }
  | { type: "ANALYZE_EXPRESSION"; text: string; targetExpression?: string };

export type AnalysisResponse =
  | {
      ok: true;
      data: import("./ai").ExpressionAnalysis;
      timings: import("./deepseek").AnalysisTimings;
    }
  | { ok: false; error: string };
