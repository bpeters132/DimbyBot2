/**
 * Whether an idle enqueue/start attempt should report that playback began.
 *
 * Just-in-time YouTube prepare can return `deferred` without calling `play()`.
 * Callers must not treat that as a successful start (dashboard/API would lie).
 */
export function playbackStartedFromStartResult(startResult: string, isPlaying: boolean): boolean {
    return isPlaying || startResult === "ok"
}
