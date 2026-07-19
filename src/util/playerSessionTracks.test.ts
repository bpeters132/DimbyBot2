import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player } from "lavalink-client"
import type { PersistedQueueTrack } from "../types/index.js"
import { resolvePersistedTracks } from "./playerSessionTracks.js"

function stored(overrides: Partial<PersistedQueueTrack> = {}): PersistedQueueTrack {
    return {
        title: "Song",
        author: "Artist",
        uri: "https://example.com/track",
        duration: 1000,
        encoded: null,
        requesterId: "user-1",
        thumbnailUrl: null,
        isStream: false,
        ...overrides,
    }
}

function mockPlayer(hooks: {
    search?: (uri: string) => Promise<{ tracks: unknown[] }>
    decode?: (encoded: string) => Promise<unknown>
}): Player {
    return {
        search: async (uri: string) => {
            if (!hooks.search) throw new Error("search not stubbed")
            return hooks.search(uri)
        },
        node: {
            decode: {
                singleTrack: async (encoded: string) => {
                    if (!hooks.decode) throw new Error("decode not stubbed")
                    return hooks.decode(encoded)
                },
            },
        },
    } as unknown as Player
}

describe("resolvePersistedTracks transient vs permanent failures", () => {
    it("reports transientFailures when URI search throws", async () => {
        const player = mockPlayer({
            search: async () => {
                throw new Error("lavalink down")
            },
        })
        const result = await resolvePersistedTracks(player, [stored()])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 1)
    })

    it("treats empty search results as permanent failures", async () => {
        const player = mockPlayer({
            search: async () => ({ tracks: [] }),
        })
        const result = await resolvePersistedTracks(player, [stored()])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 0)
    })

    it("reports transientFailures when encoded-only decode throws", async () => {
        const player = mockPlayer({
            decode: async () => {
                throw new Error("decode failed")
            },
        })
        const result = await resolvePersistedTracks(player, [
            stored({ uri: "", encoded: "encoded-track" }),
        ])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 1)
    })
})
