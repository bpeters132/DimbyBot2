/**
 * Whether DimbyBot's `trackStuck` listener should call `player.skip()` / {@link skipCurrentTrack}.
 *
 * lavalink-client emits `trackStuck` without awaiting listeners, then advances the queue itself
 * (`queueTrackEnd` + `play` when `autoSkip` is on, or nulls the track when upcoming is empty).
 * An application skip races that advance and can drop the next queued track.
 */
export function shouldApplicationSkipOnTrackStuck(): boolean {
    return false
}
