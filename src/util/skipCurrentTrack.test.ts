import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Track } from "lavalink-client"
import { skipCurrentTrack } from "./skipCurrentTrack.js"

function nativeTrack(id: string): Track {
    return {
        encoded: `enc-${id}`,
        info: {
            title: id,
            author: "Artist",
            uri: `https://soundcloud.com/${id}`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "soundcloud",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
    } as unknown as Track
}

describe("skipCurrentTrack", () => {
    it("uses default skip when upcoming tracks exist", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        const result = await skipCurrentTrack({
            queue: { tracks: { length: 2 } },
            skip: async (skipTo, throwError) => {
                calls.push({ skipTo, throwError })
            },
        })
        assert.deepEqual(calls, [{ skipTo: undefined, throwError: undefined }])
        assert.equal(result, "skipped")
    })

    it("uses skip(0, false) when the upcoming queue is empty", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        await skipCurrentTrack({
            queue: { tracks: { length: 0 } },
            skip: async (skipTo, throwError) => {
                calls.push({ skipTo, throwError })
            },
        })
        assert.deepEqual(calls, [{ skipTo: 0, throwError: false }])
    })

    it("prepares a ready upcoming head then skips when guildId is set", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        const tracks = [nativeTrack("next"), nativeTrack("later")]
        await skipCurrentTrack({
            guildId: "guild-skip-gate",
            queue: { tracks },
            skip: async (skipTo, throwError) => {
                calls.push({ skipTo, throwError })
            },
        })
        assert.deepEqual(calls, [{ skipTo: undefined, throwError: undefined }])
        assert.equal(tracks[0]?.info.title, "next")
    })

    it("returns deferred and does not skip when upcoming YouTube prepare is transient", async () => {
        const calls: Array<{ skipTo?: number; throwError?: boolean }> = []
        const tracks = [
            {
                encoded: "yt-meta",
                info: {
                    title: "video",
                    author: "Artist",
                    uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    duration: 1000,
                    isStream: false,
                    identifier: "dQw4w9WgXcQ",
                    isSeekable: true,
                    sourceName: "youtube",
                    artworkUrl: null,
                    isrc: null,
                },
                requester: undefined,
            } as unknown as Track,
        ]
        const result = await skipCurrentTrack(
            {
                guildId: "guild-skip-defer",
                queue: { tracks },
                skip: async (skipTo, throwError) => {
                    calls.push({ skipTo, throwError })
                },
            },
            {
                origin: "http://invidious-companion:8282",
                secretKey: "changemechangeme",
                fetchImpl: async () => {
                    throw new Error("fetch failed")
                },
                sleep: async () => undefined,
            }
        )
        assert.equal(result, "deferred")
        assert.deepEqual(calls, [])
    })
})
