export function normalizeText(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = normalizeText(haystack);
  return needles.some((item) => normalized.includes(normalizeText(item)));
}

export function scoreText(haystack: string, needles: string[]): number {
  const normalized = normalizeText(haystack);
  return needles.reduce((score, needle) => {
    const target = normalizeText(needle);
    if (!target) return score;
    if (normalized === target) return score + 100;
    if (normalized.startsWith(target)) return score + 50;
    if (normalized.includes(target)) return score + 20;
    return score;
  }, 0);
}

export function toArray(value: string | number | boolean | string[]): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}
