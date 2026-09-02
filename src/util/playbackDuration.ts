/** Slack so the progress bar is not glued at 100% while audio continues. */
export const PLAYBACK_DURATION_STRETCH_SLACK_MS = 1000

/**
 * When Lavalink position runs past the stamped Playback duration, return a longer
 * Displayed duration. Returns null when the stamp is unknown or position is still inside it.
 */
export function stretchedPlaybackDurationMs(
    currentDurationMs: number,
    positionMs: number,
    slackMs: number = PLAYBACK_DURATION_STRETCH_SLACK_MS
): number | null {
    if (!Number.isFinite(currentDurationMs) || currentDurationMs <= 0) return null
    if (!Number.isFinite(positionMs) || positionMs <= currentDurationMs) return null
    const slack = Number.isFinite(slackMs) && slackMs > 0 ? slackMs : 0
    return Math.max(Math.floor(positionMs + slack), Math.floor(currentDurationMs))
}
