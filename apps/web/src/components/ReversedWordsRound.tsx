import { useEffect, useRef, useState } from 'react';

interface ReversedWordsRoundProps {
    /** The reversed word string e.g. "بتك" */
    reversedWord: string;
    /** Whether the flash sequence is active */
    isFlashing: boolean;
    canVoteRepeat: boolean;
    hasVotedRepeat: boolean;
    onVoteRepeat: () => void;
    repeatVoteCount: number;
    totalPlayers: number;
    /** Has the CURRENT player buzzed in or given an answer? */
    playerAnswered?: boolean;
}

// 1800ms per letter — slow enough to clearly read each Arabic letter
const LETTER_DISPLAY_MS = 1800;
// Gap between letters (blank frame)
const LETTER_GAP_MS = 300;
// 10 seconds without an answer → auto-trigger repeat
const AUTO_REPEAT_SECS = 10;

export function ReversedWordsRound({
    reversedWord,
    isFlashing,
    canVoteRepeat,
    hasVotedRepeat,
    onVoteRepeat,
    repeatVoteCount,
    totalPlayers,
    playerAnswered = false,
}: ReversedWordsRoundProps): JSX.Element {
    const [visibleLetter, setVisibleLetter] = useState<string | null>(null);
    const [flashDone, setFlashDone] = useState(false);
    // Countdown until auto-repeat (only shown after flash is done)
    const [autoRepeatSecs, setAutoRepeatSecs] = useState<number | null>(null);
    const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
    const autoRepeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const letters = reversedWord ? [...reversedWord] : [];
    const neededForRepeat = Math.ceil(totalPlayers * 0.5);
    const repeatEnabled = repeatVoteCount >= neededForRepeat || (flashDone && autoRepeatSecs === 0);

    function clearTimers() {
        timerRefs.current.forEach(clearTimeout);
        timerRefs.current = [];
        if (autoRepeatInterval.current) {
            clearInterval(autoRepeatInterval.current);
            autoRepeatInterval.current = null;
        }
    }

    function startAutoRepeatCountdown() {
        setAutoRepeatSecs(AUTO_REPEAT_SECS);
        autoRepeatInterval.current = setInterval(() => {
            setAutoRepeatSecs((prev) => {
                if (prev === null || prev <= 0) {
                    if (autoRepeatInterval.current) clearInterval(autoRepeatInterval.current);
                    // Auto-trigger repeat at 0
                    onVoteRepeat();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    function runSequence() {
        setFlashDone(false);
        setVisibleLetter(null);
        setAutoRepeatSecs(null);
        clearTimers();

        let delay = 120;
        for (let i = 0; i < letters.length; i++) {
            const letter = letters[i];

            // Show letter
            const showT = setTimeout(() => setVisibleLetter(letter), delay);
            timerRefs.current.push(showT);
            delay += LETTER_DISPLAY_MS;

            // Brief gap between letters
            if (i < letters.length - 1) {
                const hideT = setTimeout(() => setVisibleLetter(null), delay - LETTER_GAP_MS);
                timerRefs.current.push(hideT);
            }
        }

        // After last letter: blank then done
        const doneT = setTimeout(() => {
            setVisibleLetter(null);
            setFlashDone(true);
            // Start 10s countdown for auto-repeat (unless player already answered)
            if (!playerAnswered) {
                startAutoRepeatCountdown();
            }
        }, delay + 400);
        timerRefs.current.push(doneT);
    }

    useEffect(() => {
        if (isFlashing && letters.length > 0) {
            runSequence();
        } else {
            clearTimers();
            setVisibleLetter(null);
            setFlashDone(false);
            setAutoRepeatSecs(null);
        }

        return clearTimers;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFlashing, reversedWord]);

    // Stop auto-repeat countdown if player answered
    useEffect(() => {
        if (playerAnswered && autoRepeatInterval.current) {
            clearInterval(autoRepeatInterval.current);
            autoRepeatInterval.current = null;
            setAutoRepeatSecs(null);
        }
    }, [playerAnswered]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>

            {/* Big letter flash box — fully self-contained, no external CSS class */}
            <div style={{
                width: '100%',
                maxWidth: 280,
                height: 200,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(0,255,255,0.35)',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.45)',
                flexShrink: 0,
            }}>
                <div
                    key={visibleLetter ?? '__empty__'}
                    dir="rtl"
                    style={{
                        fontSize: '6rem',
                        lineHeight: 1,
                        fontFamily: 'var(--arc-arabic-font)',
                        fontWeight: 900,
                        color: visibleLetter ? 'var(--arc-neon-cyan)' : 'rgba(0,255,255,0.15)',
                        textShadow: visibleLetter ? 'var(--arc-glow-cyan)' : 'none',
                        userSelect: 'none',
                        overflow: 'hidden',
                        maxWidth: '100%',
                        textAlign: 'center',
                        transition: 'color 0.1s ease',
                    }}
                >
                    {visibleLetter ?? (flashDone ? '' : '؟')}
                </div>
            </div>

            {/* After flash: "BUZZ IN!" message */}
            {flashDone && (
                <p style={{
                    fontFamily: 'var(--arc-pixel-font)',
                    fontSize: '0.75rem',
                    color: 'var(--arc-neon-cyan)',
                    textShadow: 'var(--arc-glow-cyan)',
                    letterSpacing: 3,
                    textAlign: 'center',
                    animation: 'blink 1.2s step-end infinite',
                }}>
                    ⚡ SEQUENCE DONE — BUZZ IN!
                </p>
            )}

            {/* Auto-repeat countdown */}
            {flashDone && autoRepeatSecs !== null && autoRepeatSecs > 0 && !playerAnswered && (
                <p style={{
                    fontFamily: 'var(--arc-pixel-font)',
                    fontSize: '0.5rem',
                    color: 'var(--arc-text-soft)',
                    letterSpacing: 2,
                }}>
                    AUTO-REPEAT IN {autoRepeatSecs}s
                </p>
            )}

            {/* Vote to repeat */}
            {canVoteRepeat && (
                <div className="repeat-vote-bar">
                    <button
                        type="button"
                        className={`arcade-btn${hasVotedRepeat ? '' : ' arcade-btn-yellow'}`}
                        disabled={hasVotedRepeat}
                        onClick={onVoteRepeat}
                        style={{ fontSize: '0.5rem' }}
                    >
                        {hasVotedRepeat ? '✓ VOTED' : '🔁 VOTE REPEAT'}
                    </button>
                    <span className="repeat-vote-count">
                        {repeatVoteCount}/{neededForRepeat} needed
                        {repeatEnabled && !hasVotedRepeat && (
                            <span style={{ color: 'var(--arc-neon-green)', marginLeft: 8 }}>✓ THRESHOLD MET!</span>
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}
