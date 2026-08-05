import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player } from "lavalink-client"
import {
    PLAYLIST_SEARCH_TRANSIENT_ERROR,
    isPlaylistSearchTransientFailure,
    pickPlayerForPlaylistSearch,
} from "./playlistQueue.js"

describe("isPlaylistSearchTransientFailure", () => {
    it("only treats the dedicated search-failed sentinel as retryable", () => {
        assert.equal(isPlaylistSearchTransientFailure(PLAYLIST_SEARCH_TRANSIENT_ERROR), true)
        assert.equal(isPlaylistSearchTransientFailure("No tracks found."), false)
        assert.equal(isPlaylistSearchTransientFailure("Search failed"), false)
        assert.equal(isPlaylistSearchTransientFailure(""), false)
    })
})

describe("pickPlayerForPlaylistSearch", () => {
    function mockPlayer(guildId: string): Player {
        return { guildId } as unknown as Player
    }

    it("prefers the guild player when present", () => {
        const preferred = mockPlayer("g1")
        const other = mockPlayer("g2")
        const players = new Map<string, Player>([
            ["g2", other],
            ["g1", preferred],
        ])
        const picked = pickPlayerForPlaylistSearch(
            {
                getPlayer(id) {
                    return players.get(id)
                },
                players,
            },
            "g1"
        )
        assert.equal(picked, preferred)
    })

    it("falls back to any active player when the preferred guild has none", () => {
        const only = mockPlayer("g2")
        const players = new Map<string, Player>([["g2", only]])
        const picked = pickPlayerForPlaylistSearch(
            {
                getPlayer() {
                    return undefined
                },
                players,
            },
            "g1"
        )
        assert.equal(picked, only)
    })

    it("returns undefined when no players exist", () => {
        const players = new Map<string, Player>()
        const picked = pickPlayerForPlaylistSearch(
            {
                getPlayer() {
                    return undefined
                },
                players,
            },
            "g1"
        )
        assert.equal(picked, undefined)
    })
})
