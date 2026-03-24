/**
 * Estimate token count for a string.
 * Heuristic: ~1.33 tokens per word (good enough for budget estimation).
 */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return Math.ceil(words.length * 1.33);
}
