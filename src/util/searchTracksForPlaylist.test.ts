import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    PLAYLIST_SEARCH_TRANSIENT_ERROR,
    searchTracksForPlaylist,
} from "./playlistQueue.js"

function resolvedTrack(opts: {
    title: string
    uri: string
    author?: string
    duration?: number
}): Track {
    return {
        info: {
            title: opts.title,
            uri: opts.uri,
            author: opts.author ?? "Artist",
            duration: opts.duration ?? 1000,
            isStream: false,
            identifier: opts.title,
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
    } as unknown as Track
}

/** Unresolved / incomplete hit — missing `info.uri` so `isResolvedTrack` rejects it. */
function unresolvedHit(title = "Pending"): unknown {
    return { info: { title } }
}

function mockPlayer(searchImpl: (...args: unknown[]) => Promise<unknown>): Player {
    return { search: searchImpl } as unknown as Player
}

describe("searchTracksForPlaylist", () => {
    it("rejects blank queries without calling Lavalink", async () => {
        let called = false
        const player = mockPlayer(async () => {
            called = true
            return { tracks: [] }
        })
        for (const query of ["", "   ", "\t\n"]) {
            const result = await searchTracksForPlaylist(player, query, { id: "u1" })
            assert.equal(result.ok, false)
            if (result.ok === false) {
                assert.equal(result.error, "Enter a search query or URL.")
            }
        }
        assert.equal(called, false)
    })

    it("maps Lavalink search throws to the transient failure sentinel", async () => {
        const player = mockPlayer(async () => {
            throw new Error("node down")
        })
        const result = await searchTracksForPlaylist(player, "never gonna", { id: "u1" })
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.error, PLAYLIST_SEARCH_TRANSIENT_ERROR)
        }
    })

    it("fails closed when search returns no tracks", async () => {
        const player = mockPlayer(async () => ({ tracks: [], loadType: "empty" }))
        const result = await searchTracksForPlaylist(player, "obscure query", { id: "u1" })
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.error, "No tracks found.")
        }
    })

    it("returns every resolved track for playlist loadTypes", async () => {
        const t1 = resolvedTrack({ title: "A", uri: "https://example.com/a" })
        const t2 = resolvedTrack({ title: "B", uri: "https://example.com/b", author: "B-Art" })
        for (const loadType of ["playlist", "PLAYLIST_LOADED"] as const) {
            const player = mockPlayer(async () => ({
                loadType,
                tracks: [t1, unresolvedHit(), t2],
            }))
            const result = await searchTracksForPlaylist(
                player,
                "https://example.com/list",
                { id: "u1" }
            )
            assert.equal(result.ok, true)
            if (result.ok === true) {
                assert.equal(result.tracks.length, 2)
                assert.equal(result.tracks[0]?.title, "A")
                assert.equal(result.tracks[0]?.uri, "https://example.com/a")
                assert.equal(result.tracks[1]?.title, "B")
                assert.equal(result.tracks[1]?.author, "B-Art")
            }
        }
    })

    it("fails when a playlist loadType has no resolved tracks", async () => {
        const player = mockPlayer(async () => ({
            loadType: "playlist",
            tracks: [unresolvedHit("one"), unresolvedHit("two")],
        }))
        const result = await searchTracksForPlaylist(player, "https://example.com/list", {
            id: "u1",
        })
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.error, "Could not resolve any tracks from that playlist.")
        }
    })

    it("returns only the first resolved track for non-playlist loadTypes", async () => {
        const first = resolvedTrack({ title: "First", uri: "https://example.com/1" })
        const second = resolvedTrack({ title: "Second", uri: "https://example.com/2" })
        const player = mockPlayer(async () => ({
            loadType: "search",
            tracks: [first, second],
        }))
        const result = await searchTracksForPlaylist(player, "some song", { id: "u1" })
        assert.equal(result.ok, true)
        if (result.ok === true) {
            assert.equal(result.tracks.length, 1)
            assert.equal(result.tracks[0]?.title, "First")
            assert.equal(result.tracks[0]?.uri, "https://example.com/1")
        }
    })

    it("fails when the first non-playlist hit is unresolved", async () => {
        const player = mockPlayer(async () => ({
            loadType: "track",
            tracks: [unresolvedHit(), resolvedTrack({ title: "Later", uri: "https://example.com/x" })],
        }))
        const result = await searchTracksForPlaylist(player, "query", { id: "u1" })
        assert.equal(result.ok, false)
        if (result.ok === false) {
            assert.equal(result.error, "Could not resolve that track.")
        }
    })
})
