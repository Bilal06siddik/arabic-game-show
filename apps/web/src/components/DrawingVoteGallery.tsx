interface DrawingSubmission {
    playerId: string;
    imageDataUrl: string;
}

interface DrawingVoteGalleryProps {
    submissions: DrawingSubmission[];
    /** Map playerId → playerName */
    playerNames: Record<string, string>;
    myPlayerId: string | undefined;
    /** The playerId who is currently allowed to vote */
    currentVoterId: string | undefined;
    /** Whether the voting phase is over and names should be revealed */
    revealNames: boolean;
    onVote: (targetPlayerId: string) => void;
}

export function DrawingVoteGallery({
    submissions,
    playerNames,
    myPlayerId,
    currentVoterId,
    revealNames,
    onVote,
}: DrawingVoteGalleryProps): JSX.Element {
    return (
        <div className="vote-gallery">
            {submissions.map((sub, idx) => {
                const isMe = sub.playerId === myPlayerId;
                const canVote = currentVoterId === myPlayerId && !isMe;

                return (
                    <article key={sub.playerId} className="vote-gallery-card">
                        <img src={sub.imageDataUrl} alt={`Drawing ${idx + 1}`} />
                        <div className="vote-gallery-card-footer">
                            <span className="vote-gallery-artist">
                                {revealNames
                                    ? (playerNames[sub.playerId] ?? sub.playerId)
                                    : isMe
                                        ? '(your drawing)'
                                        : `Drawing #${idx + 1}`}
                            </span>
                            <button
                                type="button"
                                className="arcade-btn arcade-btn-yellow"
                                style={{ fontSize: '0.5rem', padding: '8px 10px', width: '100%' }}
                                disabled={!canVote}
                                onClick={() => onVote(sub.playerId)}
                            >
                                {isMe ? 'YOURS' : '▶ VOTE'}
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
