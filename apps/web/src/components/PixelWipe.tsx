import { useCallback, useEffect, useRef, useState } from 'react';

// Grid: 20 columns × 15 rows = 300 squares
const COLS = 20;
const ROWS = 15;
const TOTAL = COLS * ROWS;

type WipePhase = 'idle' | 'covering' | 'black' | 'revealing';

interface PixelWipeProps {
    /** Call this to start the wipe. Pass the callback to run when screen is black. */
    onRegister: (trigger: (onBlack: () => void) => void) => void;
}

const COVER_DURATION_MS = 500;
const REVEAL_DURATION_MS = 600;

export function PixelWipe({ onRegister }: PixelWipeProps): JSX.Element {
    const [phase, setPhase] = useState<WipePhase>('idle');
    // Each square: 0 = hidden, 1 = shown
    const [squares, setSquares] = useState<number[]>(Array(TOTAL).fill(0));
    const onBlackRef = useRef<(() => void) | null>(null);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    function clearTimers() {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }

    const triggerWipe = useCallback((onBlack: () => void) => {
        clearTimers();
        onBlackRef.current = onBlack;
        setPhase('covering');

        // Randomize square indices
        const indices = Array.from({ length: TOTAL }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // Stagger shows over COVER_DURATION_MS
        const newSquares = Array(TOTAL).fill(0);
        indices.forEach((squareIdx, order) => {
            const delay = Math.random() * COVER_DURATION_MS;
            const t = setTimeout(() => {
                newSquares[squareIdx] = 1;
                setSquares([...newSquares]);
            }, delay);
            timersRef.current.push(t);
        });

        // Once all covered → fire onBlack, then start reveal
        const blackT = setTimeout(() => {
            setPhase('black');
            onBlackRef.current?.();

            // Small pause then reveal
            const revealStartT = setTimeout(() => {
                setPhase('revealing');
                const revealSquares = Array(TOTAL).fill(1);
                const shuffledReveal = Array.from({ length: TOTAL }, (_, i) => i);
                for (let i = shuffledReveal.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledReveal[i], shuffledReveal[j]] = [shuffledReveal[j], shuffledReveal[i]];
                }

                shuffledReveal.forEach((squareIdx) => {
                    const d = Math.random() * REVEAL_DURATION_MS;
                    const t2 = setTimeout(() => {
                        revealSquares[squareIdx] = 0;
                        setSquares([...revealSquares]);
                    }, d);
                    timersRef.current.push(t2);
                });

                const doneT = setTimeout(() => {
                    setPhase('idle');
                    setSquares(Array(TOTAL).fill(0));
                }, REVEAL_DURATION_MS + 100);
                timersRef.current.push(doneT);
            }, 180);
            timersRef.current.push(revealStartT);
        }, COVER_DURATION_MS + 60);
        timersRef.current.push(blackT);
    }, []);

    useEffect(() => {
        onRegister(triggerWipe);
    }, [onRegister, triggerWipe]);

    useEffect(() => () => clearTimers(), []);

    if (phase === 'idle') return <></>;

    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                pointerEvents: 'all',
            }}
        >
            {squares.map((visible, i) => (
                <div
                    key={i}
                    style={{
                        backgroundColor: '#000',
                        transform: visible ? 'scale(1.05)' : 'scale(0)',
                        transition: visible
                            ? 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)'
                            : 'transform 0.22s cubic-bezier(0.55, 0, 1, 0.45)',
                        transformOrigin: 'center center',
                    }}
                />
            ))}
        </div>
    );
}
