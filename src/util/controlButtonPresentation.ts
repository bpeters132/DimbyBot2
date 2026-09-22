/**
 * Minimal player shape used to decide Discord control-message button labels and disabled flags.
 * Shuffle looks at upcoming `queue.tracks`, not the current track.
 */
export type ControlButtonPlayerView = {
    playing?: boolean
    queue?: {
        current?: unknown
        tracks?: { length: number }
    } | null
    get?: (key: string) => unknown
} | null

export type ControlButtonPresentation = {
    playPauseLabel: "Pause" | "Play"
    playPauseDisabled: boolean
    stopDisabled: boolean
    skipDisabled: boolean
    shuffleDisabled: boolean
    loopDisabled: boolean
    autoplayLabel: "Autoplay: On" | "Autoplay: Off"
    autoplayDisabled: boolean
}

/**
 * Labels and disabled flags for the persistent control-channel action rows.
 * Play/pause/stop/skip require a current track; shuffle requires upcoming tracks;
 * loop is enabled when either exists; autoplay is enabled whenever a player object exists.
 */
export function controlButtonPresentation(
    player: ControlButtonPlayerView | undefined
): ControlButtonPresentation {
    const isPlaying = Boolean(player && player.playing)
    const hasCurrent = Boolean(player && player.queue && player.queue.current)
    const hasQueue = Boolean(player && player.queue && player.queue.tracks.length > 0)
    const autoplayOn = Boolean(player?.get?.("autoplay"))

    return {
        playPauseLabel: isPlaying ? "Pause" : "Play",
        playPauseDisabled: !hasCurrent,
        stopDisabled: !hasCurrent,
        skipDisabled: !hasCurrent,
        shuffleDisabled: !hasQueue,
        loopDisabled: !hasCurrent && !hasQueue,
        autoplayLabel: autoplayOn ? "Autoplay: On" : "Autoplay: Off",
        autoplayDisabled: !player,
    }
}
