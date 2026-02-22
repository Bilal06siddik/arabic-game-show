export function normalizeArabic(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next =
        a[i - 1] === b[j - 1]
          ? matrix[j - 1]
          : 1 + Math.min(prev, matrix[j], matrix[j - 1]);
      matrix[j - 1] = prev;
      prev = next;
    }
    matrix[b.length] = prev;
  }
  return matrix[b.length];
}

export function matchesAnswer(
  input: string,
  answer: string,
  alternatives: string[] = [],
): boolean {
  if (!input.trim()) {
    return false;
  }

  const normalizedInput = normalizeArabic(input);
  const normalizedAnswer = normalizeArabic(answer);

  // 1. Exact match
  if (normalizedInput === normalizedAnswer) {
    return true;
  }

  // 2. Substring match — input contains answer or answer contains input
  if (
    normalizedAnswer.includes(normalizedInput) ||
    normalizedInput.includes(normalizedAnswer)
  ) {
    return true;
  }

  // 3. Word-level match — any significant word (3+ chars) in the correct answer matches the input
  //    e.g. typing "سعودية" matches "المملكة العربية السعودية"
  const answerWords = normalizedAnswer.split(' ').filter((w) => w.length >= 3);
  for (const word of answerWords) {
    if (
      normalizedInput === word ||
      word.includes(normalizedInput) ||
      normalizedInput.includes(word)
    ) {
      return true;
    }
  }

  // 4. Check alternatives (including English country names)
  for (const alternative of alternatives) {
    const normalizedAlt = normalizeArabic(alternative);
    if (
      normalizedInput === normalizedAlt ||
      normalizedAlt.includes(normalizedInput) ||
      normalizedInput.includes(normalizedAlt)
    ) {
      return true;
    }
    // Word-level within the alternative
    const altWords = normalizedAlt.split(' ').filter((w) => w.length >= 3);
    for (const word of altWords) {
      if (
        normalizedInput === word ||
        word.includes(normalizedInput) ||
        normalizedInput.includes(word)
      ) {
        return true;
      }
    }
  }

  // 5. Fuzzy (Levenshtein) fallback — whole answer
  if (normalizedAnswer.length > 4) {
    const threshold = Math.max(1, Math.floor(normalizedAnswer.length * 0.25));
    if (levenshtein(normalizedInput, normalizedAnswer) <= threshold) {
      return true;
    }
  }
  // Also fuzzy each word in the answer
  for (const word of answerWords) {
    if (word.length > 4) {
      const wordThreshold = Math.max(1, Math.floor(word.length * 0.25));
      if (levenshtein(normalizedInput, word) <= wordThreshold) {
        return true;
      }
    }
  }

  return false;
}