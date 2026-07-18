import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    clearPlayerSessionRestoreInProgress,
    markPlayerSessionRestoreInProgress,
    shouldSkipPlayerSessionClear,
    shouldSkipPlayerSessionClearForState,
    snapshotFromPlayer,
    suppressNextPlayerSessionClear,
} from "./playerSessionPersistence.js"
import { persistedTrackFromLavalink } from "./playerSessionTracks.js"
import { getRequesterUserId } from "./rrqDisconnect.js"

function mockTrack(overrides: Partial<Track["info"]> & { encoded?: string } = {}): Track {
    const { encoded, ...infoOverrides } = overrides
    return {
        encoded: encoded ?? "enc",
        info: {
            title: "Song",
            author: "Artist",
            uri: "https://example.com/t",
            duration: 1000,
            isStream: false,
            identifier: "id",
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
            ...infoOverrides,
        },
        requester: "user-1",
    } as Track
}

function mockPlayer(opts: {
    current?: Track | null
    tracks?: Track[]
    volume?: number
    voiceChannelId?: string | null
}): Player {
    const store = new Map<string, unknown>()
    return {
        guildId: "guild-1",
        voiceChannelId: opts.voiceChannelId === undefined ? "vc-1" : opts.voiceChannelId,
        textChannelId: "text-1",
        volume: opts.volume ?? 80,
        repeatMode: "off",
        paused: false,
        playing: true,
        queue: {
            current: opts.current === undefined ? mockTrack() : opts.current,
            tracks: opts.tracks ?? [],
        },
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
    } as unknown as Player
}

describe("getRequesterUserId", () => {
    it("reads string, object id, and safe numeric ids", () => {
        assert.equal(getRequesterUserId("abc"), "abc")
        assert.equal(getRequesterUserId({ id: "xyz" }), "xyz")
        assert.equal(getRequesterUserId({ id: 42 }), "42")
        assert.equal(getRequesterUserId({ id: 10n }), "10")
        assert.equal(getRequesterUserId(null), null)
        assert.equal(getRequesterUserId({}), null)
    })
})

describe("persistedTrackFromLavalink", () => {
    it("serializes a resolved track", () => {
        const persisted = persistedTrackFromLavalink(mockTrack())
        assert.ok(persisted)
        assert.equal(persisted.title, "Song")
        assert.equal(persisted.uri, "https://example.com/t")
        assert.equal(persisted.requesterId, "user-1")
        assert.equal(persisted.encoded, "enc")
    })

    it("returns null when uri is missing (nothing restorable)", () => {
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: "  " })), null)
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: undefined })), null)
    })

    it("falls back to Unknown for blank title/author", () => {
        const persisted = persistedTrackFromLavalink(mockTrack({ title: " ", author: "" }))
        assert.ok(persisted)
        assert.equal(persisted.title, "Unknown")
        assert.equal(persisted.author, "Unknown")
    })
})

describe("snapshotFromPlayer", () => {
    it("returns null for an empty player (must not drive session delete on save)", () => {
        assert.equal(snapshotFromPlayer(mockPlayer({ current: null, tracks: [] })), null)
    })

    it("builds a v1 snapshot when current or queue has tracks", () => {
        const withCurrent = snapshotFromPlayer(mockPlayer({}))
        assert.ok(withCurrent)
        assert.equal(withCurrent.version, 1)
        assert.equal(withCurrent.volume, 80)
        assert.equal(withCurrent.current?.title, "Song")

        const queueOnly = snapshotFromPlayer(
            mockPlayer({ current: null, tracks: [mockTrack({ title: "Q" })] })
        )
        assert.ok(queueOnly)
        assert.equal(queueOnly.current, null)
        assert.equal(queueOnly.queue[0]?.title, "Q")
    })
})

describe("shouldSkipPlayerSessionClear", () => {
    afterEach(() => {
        clearPlayerSessionRestoreInProgress("guild-restore")
    })

    it("skips clear while restore is in progress (orphan destroy must keep row)", () => {
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), false)
        markPlayerSessionRestoreInProgress("guild-restore")
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), true)
        clearPlayerSessionRestoreInProgress("guild-restore")
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), false)
    })

    it("skips clear for shutdown, restore, or suppress combinations", () => {
        assert.equal(shouldSkipPlayerSessionClearForState(false, false), false)
        assert.equal(shouldSkipPlayerSessionClearForState(true, false), true)
        assert.equal(shouldSkipPlayerSessionClearForState(false, true), true)
        assert.equal(shouldSkipPlayerSessionClearForState(true, true), true)
        assert.equal(shouldSkipPlayerSessionClearForState(false, false, true), true)
    })

    it("skips clear after suppressNextPlayerSessionClear (ephemeral web teardown)", () => {
        assert.equal(shouldSkipPlayerSessionClear("guild-ephemeral"), false)
        suppressNextPlayerSessionClear("guild-ephemeral")
        assert.equal(shouldSkipPlayerSessionClear("guild-ephemeral"), true)
    })
})
