import { getLivePlayerIfUnchanged } from "./livePlayerIdentity.js"

type TrackErrorRecoveryPlayer = {
    queue: { tracks: { length: number } }
    get: (key: string) => unknown
}

export type TrackErrorRecoveryTarget<T extends TrackErrorRecoveryPlayer> =
    | { kind: "stale" }
    | { kind: "skip"; player: T }
    | { kind: "autoplay"; player: T }
    | { kind: "idle"; player: T }

/**
 * After `trackError` awaits companion remint, re-resolve the guild player before skip /
 * autoplay `stopPlaying` / idle destroy. A destroyed Player still holds queue + autoplay
 * flags in memory, and `stopPlaying` is guild-keyed — ending the closed-over instance
 * would null a successor session's current track.
 */
export function resolveTrackErrorRecoveryTarget<T extends TrackErrorRecoveryPlayer>(
    getLivePlayer: () => T | null | undefined,
    expected: T
): TrackErrorRecoveryTarget<T> {
    const live = getLivePlayerIfUnchanged(getLivePlayer, expected)
    if (!live) return { kind: "stale" }
    if (live.queue.tracks.length > 0) return { kind: "skip", player: live }
    if (live.get("autoplay") === true) return { kind: "autoplay", player: live }
    return { kind: "idle", player: live }
}
