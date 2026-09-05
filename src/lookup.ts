export function isTargetLookupInput(value: string) {
  const text = value.trim();
  if (!text || /[,;:\n]/.test(text)) return false;
  const words = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  if (words.length === 0 || words.length > 6) return false;
  if (words.length === 1) return true;

  // Short selections that already look like a clause remain in discovery mode.
  return !/^(?:i|you|he|she|it|we|they|this|that|these|those|there|the|a|an)\b.*(?:\b(?:am|is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|may|might|must)\b|(?:i['’]m|(?:he|she|it|that|there)['’]s|(?:we|you|they)['’]re))/i.test(text);
}
