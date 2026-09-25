export type PlayerRepeatMode = "off" | "track" | "queue"

/**
 * Cycles control-channel / dashboard loop: off → track → queue → off.
 * Unknown or missing values fail closed to `off` so a surprising Lavalink mode disables loop
 * instead of skipping a step or throwing.
 */
export function nextPlayerRepeatMode(current: string | null | undefined): PlayerRepeatMode {
    if (current === "off") return "track"
    if (current === "track") return "queue"
    return "off"
}
