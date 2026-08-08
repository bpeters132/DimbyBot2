import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    isAllowedSearchLoadType,
    resolveAutoplaySeed,
    shouldStillInjectAutoplayTrack,
    titleAfterArtistPrefix,
} from "./autoplaySeed.js"

function mockPlayer(opts?: {
    previous?: Track[]
    lastTrack?: { title?: string; artist?: string }
    autoplay?: boolean
    tracks?: unknown[]
    current?: unknown
    playing?: boolean
}): Player {
    const store = new Map<string, unknown>()
    if (opts?.lastTrack) store.set("lastTrack", opts.lastTrack)
    if (opts?.autoplay) store.set("autoplay", true)
    return {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
        playing: opts?.playing ?? false,
        queue: {
            current: opts?.current ?? null,
            tracks: opts?.tracks ?? [],
            previous: opts?.previous ?? [],
        },
    } as unknown as Player
}

function track(title: string, author: string): Track {
    return {
        info: { title, author, uri: "https://example.com/t" },
        encoded: "enc",
        requester: null,
    } as unknown as Track
}

describe("titleAfterArtistPrefix", () => {
    it("strips a duplicated artist prefix before common separators", () => {
        assert.equal(titleAfterArtistPrefix("Artist - Song", "Artist"), "Song")
        assert.equal(titleAfterArtistPrefix("Artist – Song", "Artist"), "Song")
        assert.equal(titleAfterArtistPrefix("Artist: Song", "artist"), "Song")
        assert.equal(titleAfterArtistPrefix("Artist | Song Title", "Artist"), "Song Title")
    })

    it("returns null when the title does not start with artist + separator", () => {
        assert.equal(titleAfterArtistPrefix("Song", "Artist"), null)
        assert.equal(titleAfterArtistPrefix("Artist Song", "Artist"), null)
        assert.equal(titleAfterArtistPrefix("Artist -", "Artist"), null)
        assert.equal(titleAfterArtistPrefix("", "Artist"), null)
        assert.equal(titleAfterArtistPrefix("Artist - Song", ""), null)
    })
})

describe("resolveAutoplaySeed", () => {
    it("uses ended track metadata and strips duplicated artist prefixes", () => {
        const player = mockPlayer()
        assert.deepEqual(resolveAutoplaySeed(player, track("Artist - Real Title", "Artist")), {
            artist: "Artist",
            title: "Real Title",
        })
    })

    it("parses Artist - Title from the title when author is missing or Unknown", () => {
        const player = mockPlayer()
        assert.deepEqual(resolveAutoplaySeed(player, track("Band — Hit Song", "Unknown")), {
            artist: "Band",
            title: "Hit Song",
        })
        assert.deepEqual(resolveAutoplaySeed(player, track("Band - Hit Song", "")), {
            artist: "Band",
            title: "Hit Song",
        })
    })

    it("falls back to queue.previous then lastTrack metadata", () => {
        const withPrevious = mockPlayer({ previous: [track("Prev Song", "Prev Artist")] })
        assert.deepEqual(resolveAutoplaySeed(withPrevious, undefined), {
            artist: "Prev Artist",
            title: "Prev Song",
        })

        const withStored = mockPlayer({
            lastTrack: { title: "Stored Song", artist: "Stored Artist" },
        })
        assert.deepEqual(resolveAutoplaySeed(withStored, undefined), {
            artist: "Stored Artist",
            title: "Stored Song",
        })
    })

    it("defaults missing artist to Unknown Artist and returns null without a title", () => {
        const player = mockPlayer()
        assert.deepEqual(resolveAutoplaySeed(player, track("Only Title", "")), {
            artist: "Unknown Artist",
            title: "Only Title",
        })
        assert.equal(resolveAutoplaySeed(player, undefined), null)
    })
})

describe("isAllowedSearchLoadType", () => {
    it("accepts Lavalink track/search/playlist load types", () => {
        for (const loadType of [
            "track",
            "TRACK_LOADED",
            "SEARCH_RESULT",
            "search",
            "playlist",
            "PLAYLIST_LOADED",
        ]) {
            assert.equal(isAllowedSearchLoadType({ loadType } as never), true)
        }
    })

    it("rejects empty, failed, or unknown load types", () => {
        assert.equal(isAllowedSearchLoadType(null), false)
        assert.equal(isAllowedSearchLoadType(undefined), false)
        assert.equal(isAllowedSearchLoadType({ loadType: "LOAD_FAILED" } as never), false)
        assert.equal(isAllowedSearchLoadType({ loadType: "NO_MATCHES" } as never), false)
        assert.equal(isAllowedSearchLoadType({} as never), false)
    })
})

describe("shouldStillInjectAutoplayTrack", () => {
    it("injects only when autoplay is on and the player is idle with an empty queue", () => {
        assert.equal(shouldStillInjectAutoplayTrack(mockPlayer({ autoplay: true })), true)
        assert.equal(shouldStillInjectAutoplayTrack(mockPlayer()), false)
        assert.equal(
            shouldStillInjectAutoplayTrack(mockPlayer({ autoplay: true, tracks: [{}] })),
            false
        )
        assert.equal(
            shouldStillInjectAutoplayTrack(mockPlayer({ autoplay: true, current: {} })),
            false
        )
        assert.equal(
            shouldStillInjectAutoplayTrack(mockPlayer({ autoplay: true, playing: true })),
            false
        )
    })
})
