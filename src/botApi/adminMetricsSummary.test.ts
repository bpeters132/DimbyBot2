import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { currentTrackSummary, playerStatus } from "./adminMetricsSummary.js"

describe("playerStatus", () => {
    it("prefers playing over paused, otherwise idle", () => {
        assert.equal(playerStatus({ playing: true, paused: true } as Player), "playing")
        assert.equal(playerStatus({ playing: false, paused: true } as Player), "paused")
        assert.equal(playerStatus({ playing: false, paused: false } as Player), "idle")
    })
})

describe("currentTrackSummary", () => {
    it("returns null when track info is missing", () => {
        assert.equal(currentTrackSummary(null), null)
        assert.equal(currentTrackSummary(undefined), null)
        assert.equal(currentTrackSummary({} as Track), null)
    })

    it("trims fields and falls back blank titles to Unknown", () => {
        assert.deepEqual(
            currentTrackSummary({
                info: {
                    title: "  Song  ",
                    author: "  Artist  ",
                    uri: "  https://example.com/t  ",
                },
            } as Track),
            {
                title: "Song",
                author: "Artist",
                uri: "https://example.com/t",
            }
        )
        assert.deepEqual(
            currentTrackSummary({
                info: { title: "   ", author: "", uri: "  " },
            } as Track),
            { title: "Unknown", author: undefined, uri: undefined }
        )
    })
})
