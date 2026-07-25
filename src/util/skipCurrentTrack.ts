/**
 * Advances past the current track without using default `skip()`, which throws when the
 * upcoming queue is empty (lavalink-client). Matches `/skip`, control buttons, and web player.
 */
export async function skipCurrentTrack(player: {
    queue: { tracks: { length: number } }
    skip: (skipTo?: number, throwError?: boolean) => Promise<unknown>
}): Promise<void> {
    if (player.queue.tracks.length > 0) {
        await player.skip()
        return
    }
    await player.skip(0, false)
}
