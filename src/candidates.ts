import type { AnalyzedExpression, ExpressionAnalysis } from "./ai";

export interface SessionCandidate {
  key: string;
  expression: string;
  meaningZh: string;
  details?: AnalyzedExpression;
}

export interface CandidateSession {
  sentence: string;
  sentenceTranslationZh: string;
  candidates: SessionCandidate[];
  activeKey: string;
}

export function candidateKey(expression: string) {
  return expression.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function createCandidateSession(analysis: ExpressionAnalysis): CandidateSession | null {
  const primary = analysis.primary_expression;
  if (!analysis.has_useful_expression || !primary) return null;
  const candidates: SessionCandidate[] = [{
    key: candidateKey(primary.expression),
    expression: primary.expression,
    meaningZh: primary.meaning_zh,
    details: primary,
  }];
  for (const secondary of analysis.secondary_candidates) {
    const key = candidateKey(secondary.expression);
    if (!candidates.some((candidate) => candidate.key === key)) {
      candidates.push({ key, expression: secondary.expression, meaningZh: secondary.meaning_zh });
    }
  }
  return {
    sentence: analysis.sentence,
    sentenceTranslationZh: analysis.sentence_translation_zh,
    candidates: candidates.slice(0, 3),
    activeKey: candidates[0].key,
  };
}

export function selectCandidate(session: CandidateSession, key: string): CandidateSession {
  if (!session.candidates.some((candidate) => candidate.key === key)) throw new Error("Candidate is not part of this analysis session.");
  return { ...session, activeKey: key };
}

export function cacheCandidateAnalysis(session: CandidateSession, key: string, analysis: ExpressionAnalysis): CandidateSession {
  const primary = analysis.primary_expression;
  if (!analysis.has_useful_expression || !primary) throw new Error("The selected candidate did not return a complete analysis.");
  return {
    ...session,
    activeKey: key,
    candidates: session.candidates.map((candidate) => candidate.key === key ? {
      ...candidate,
      expression: primary.expression,
      meaningZh: primary.meaning_zh,
      details: primary,
    } : candidate),
  };
}

export function activeCandidateAnalysis(session: CandidateSession): ExpressionAnalysis | null {
  const candidate = session.candidates.find((item) => item.key === session.activeKey);
  if (!candidate?.details) return null;
  return {
    sentence: session.sentence,
    sentence_translation_zh: session.sentenceTranslationZh,
    has_useful_expression: true,
    primary_expression: candidate.details,
    secondary_candidates: [],
  };
}
