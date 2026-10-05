import { isSameLivePlayer } from "../util/livePlayerIdentity.js"

/** Dashboard enqueue raced with `/stop` / a successor player. Must stay 409, not 404/200. */
export const LIVE_PLAYER_RACE_HTTP_STATUS = 409 as const

const TRACK_RACE_ERROR = "Player stopped before the track could be queued. Try again."
const PLAYLIST_RACE_ERROR = "Player stopped before the playlist could be queued. Try again."

export type LivePlayerRaceTarget = "track" | "playlist"

export type LivePlayerRaceHttp = {
    status: typeof LIVE_PLAYER_RACE_HTTP_STATUS
    error: { error: string }
}

/**
 * Maps a live-player destroy/replace during dashboard enqueue to HTTP 409.
 * Track vs playlist copy must stay distinct so the dashboard can retry the right action.
 */
export function mapLivePlayerRaceToHttp(target: LivePlayerRaceTarget): LivePlayerRaceHttp {
    return {
        status: LIVE_PLAYER_RACE_HTTP_STATUS,
        error: {
            error: target === "playlist" ? PLAYLIST_RACE_ERROR : TRACK_RACE_ERROR,
        },
    }
}

/**
 * True when search enqueue still owns the expected live player.
 * `no_player` and successor identity are 409 races — callers must not treat those as success.
 */
export function isLiveSearchEnqueueOnExpectedPlayer<
    T extends object,
    TOk extends { status: "ok"; player: T },
>(enqueued: { status: "no_player" } | TOk, expectedPlayer: T): enqueued is TOk {
    return enqueued.status === "ok" && isSameLivePlayer(enqueued.player, expectedPlayer)
}
