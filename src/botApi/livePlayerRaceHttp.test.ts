import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    LIVE_PLAYER_RACE_HTTP_STATUS,
    isLiveSearchEnqueueOnExpectedPlayer,
    mapLivePlayerRaceToHttp,
} from "./livePlayerRaceHttp.js"

describe("mapLivePlayerRaceToHttp", () => {
    it("returns 409 with track copy for search/play enqueue races", () => {
        assert.deepEqual(mapLivePlayerRaceToHttp("track"), {
            status: LIVE_PLAYER_RACE_HTTP_STATUS,
            error: { error: "Player stopped before the track could be queued. Try again." },
        })
        assert.equal(mapLivePlayerRaceToHttp("track").status, 409)
    })

    it("returns 409 with playlist copy, not the track message", () => {
        const playlist = mapLivePlayerRaceToHttp("playlist")
        const track = mapLivePlayerRaceToHttp("track")
        assert.equal(playlist.status, 409)
        assert.equal(
            playlist.error.error,
            "Player stopped before the playlist could be queued. Try again."
        )
        assert.notEqual(playlist.error.error, track.error.error)
    })

    it("does not collapse a live-player race into 404 or 200", () => {
        for (const target of ["track", "playlist"] as const) {
            const mapped = mapLivePlayerRaceToHttp(target)
            assert.notEqual(mapped.status, 404)
            assert.notEqual(mapped.status, 200)
            assert.equal(mapped.status, 409)
        }
    })
})

describe("isLiveSearchEnqueueOnExpectedPlayer", () => {
    const expected = { guildId: "g1" }
    const successor = { guildId: "g1" }

    it("is false when enqueue reports no_player (destroyed during search)", () => {
        assert.equal(isLiveSearchEnqueueOnExpectedPlayer({ status: "no_player" }, expected), false)
    })

    it("is false when enqueue succeeded on a successor instance", () => {
        assert.equal(
            isLiveSearchEnqueueOnExpectedPlayer({ status: "ok", player: successor }, expected),
            false
        )
    })

    it("is true when enqueue succeeded on the same live player", () => {
        assert.equal(
            isLiveSearchEnqueueOnExpectedPlayer({ status: "ok", player: expected }, expected),
            true
        )
    })
})
