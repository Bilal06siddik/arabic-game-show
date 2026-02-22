/**
 * Fuzzy answer matching utility for flag/picture rounds.
 * Accepts shortened, colloquial, or misspelled versions.
 */

function normalize(str: string): string {
    return str
        .toLowerCase()
        .trim()
        // Remove Arabic diacritics (tashkeel)
        .replace(/[\u064B-\u065F\u0670]/g, '')
        // Normalize common Arabic letter variants
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ةه]/g, 'ه')
        .replace(/[يى]/g, 'ي')
        // Remove "al-" / "el-" / "the " prefixes
        .replace(/^(al|el|the)\s*[-\s]*/i, '')
        // Remove trailing "-ia", "-iya", "-a", "-stan" etc only for very long strings
        // Strip punctuation and extra whitespace
        .replace(/[^a-z0-9\u0600-\u06FF\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

/**
 * Returns true if the player's input is a forgiving match for any accepted answer.
 * Accepts partial matches, colloquial spellings, and bilingual (AR/EN) answers.
 */
export function fuzzyMatchAnswer(input: string, accepted: string[]): boolean {
    if (!input.trim()) return false;

    const normInput = normalize(input);

    for (const candidate of accepted) {
        const normCandidate = normalize(candidate);

        // Exact normalized match
        if (normInput === normCandidate) return true;

        // Substring match (input inside candidate or vice versa)
        if (normCandidate.includes(normInput) || normInput.includes(normCandidate)) {
            // Only accept if the shorter string is long enough to avoid false positives
            const shorter = Math.min(normInput.length, normCandidate.length);
            if (shorter >= 3) return true;
        }

        // Levenshtein distance — forgiving for longer strings
        const dist = levenshtein(normInput, normCandidate);
        const maxLen = Math.max(normInput.length, normCandidate.length);

        if (maxLen >= 8 && dist <= 3) return true;
        if (maxLen >= 5 && dist <= 2) return true;
        if (maxLen >= 3 && dist <= 1) return true;
    }

    return false;
}
