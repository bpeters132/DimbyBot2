/** Scales bot API wait time with playlist size (Lavalink resolves one URI per track). */
export function playlistPlayTimeoutMs(trackCount: number): number {
    const count = Number.isFinite(trackCount) && trackCount > 0 ? Math.floor(trackCount) : 1
    const baseMs = 30_000
    const perTrackMs = 2_500
    return Math.min(300_000, baseMs + count * perTrackMs)
}
