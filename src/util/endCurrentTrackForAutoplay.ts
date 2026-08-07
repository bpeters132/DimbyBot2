/**
 * Ends the current track so lavalink-client `queueEnd` can run autoplay, without using
 * `skip()`.
 *
 * `skip()` sets `internal_skipped`, which bypasses `minAutoPlayMs` (~10s). On `trackError`
 * with an empty upcoming queue that would re-enter autoplay immediately for every failing
 * catalog pick (recent-history rotates after the per-player recent-song cap), causing a
 * tight search/play/error loop.
 *
 * `stopPlaying(false, true)` nulls the current track, allows autoplay, and leaves the spam
 * limiter intact.
 */
export async function endCurrentTrackForAutoplay(player: {
    stopPlaying: (clearQueue?: boolean, executeAutoplay?: boolean) => Promise<unknown>
}): Promise<void> {
    await player.stopPlaying(false, true)
}
