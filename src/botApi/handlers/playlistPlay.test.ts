import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const USER = "100000000000000002"
const GUILD = "100000000000000001"

const guardOk = {
    ok: true as const,
    discordUserId: USER,
    session: { user: { id: "u", name: "Ada" }, session: { id: "s", expiresAt: "2099-01-01" } },
    permissionResolution: {},
}

const player = {
    guildId: GUILD,
    playing: true,
    paused: false,
    position: 0,
    repeatMode: "off",
    volume: 100,
    voiceChannelId: "voice-1",
    queue: { current: null, tracks: [] as unknown[] },
    get: () => false,
}

const state = {
    guard: guardOk as
        | typeof guardOk
        | { ok: false; status: number; error: string; details?: string },
    playlist: {
        id: 1,
        name: "Mix",
        userId: USER,
        tracks: [{ uri: "https://example.com/s" }],
    } as null | { id: number; name: string; userId: string; tracks: unknown[] },
    voice: { ok: true as const, player, playbackStarted: false } as
        | { ok: true; player: typeof player; playbackStarted: boolean }
        | { ok: false; status: number; error: { error: string } },
    resolved: { resolved: [{}], failed: 0 } as { resolved: unknown[]; failed: number },
    enqueue: { queued: 2 } as { queued: number } | "no_player",
    playlistThrows: false,
    clientThrows: false,
}

mock.module("../../shared/api-auth.js", {
    namedExports: {
        requirePermissions: async () => state.guard,
    },
})

mock.module("../../repositories/playlistRepository.js", {
    namedExports: {
        getPlaylistById: async () => {
            if (state.playlistThrows) throw new Error("db down")
            return state.playlist
        },
    },
})

mock.module("./searchAndEnqueue.js", {
    namedExports: {
        searchAndEnqueue: async () => state.voice,
    },
})

mock.module("../../util/playlistQueue.js", {
    namedExports: {
        playerHasQueueContent: () => false,
        resolveStoredPlaylistTracks: async () => state.resolved,
        enqueueResolvedPlaylistTracks: async () => state.enqueue,
    },
})

mock.module("../../lib/botClientRegistry.js", {
    namedExports: {
        tryGetBotClient: () => null,
        getBotClient: () => {
            if (state.clientThrows) throw new Error("bot down")
            return { lavalink: { getPlayer: () => player } }
        },
    },
})

const { playerPlaylistPlayPOST } = await import("./playlistPlay.js")

describe("playerPlaylistPlayPOST", () => {
    it("returns the permission failure", async () => {
        state.guard = { ok: false, status: 401, error: "Unauthorized" }
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
        state.guard = guardOk
    })

    it("returns 403 when the requester does not match the session", async () => {
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, {
            playlistId: 1,
            requesterDiscordUserId: "100000000000000009",
        })
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
    })

    it("returns 400 when playlistId is missing", async () => {
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, {})
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.details,
            "playlistId is required."
        )
    })

    it("returns 404 when the playlist does not exist", async () => {
        state.playlist = null
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 404)
        assert.equal(result.body.ok === false && result.body.error.details, "Playlist not found.")
        state.playlist = {
            id: 1,
            name: "Mix",
            userId: USER,
            tracks: [{ uri: "https://example.com/s" }],
        }
    })

    it("returns 403 when the user does not own the playlist", async () => {
        state.playlist = {
            id: 1,
            name: "Mix",
            userId: "100000000000000009",
            tracks: [{ uri: "x" }],
        }
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 403)
        assert.equal(
            result.body.ok === false && result.body.error.details,
            "You do not own this playlist."
        )
        state.playlist = {
            id: 1,
            name: "Mix",
            userId: USER,
            tracks: [{ uri: "https://example.com/s" }],
        }
    })

    it("returns 400 when the playlist has no tracks", async () => {
        state.playlist = { id: 1, name: "Mix", userId: USER, tracks: [] }
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.details,
            "Playlist has no tracks."
        )
        state.playlist = {
            id: 1,
            name: "Mix",
            userId: USER,
            tracks: [{ uri: "https://example.com/s" }],
        }
    })

    it("returns the voice setup failure", async () => {
        state.voice = { ok: false, status: 400, error: { error: "Join a voice channel first." } }
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 400)
        assert.equal(
            result.body.ok === false && result.body.error.error,
            "Join a voice channel first."
        )
        state.voice = { ok: true, player, playbackStarted: false }
    })

    it("returns 404 when no playlist tracks resolve", async () => {
        state.resolved = { resolved: [], failed: 1 }
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 404)
        assert.equal(result.body.ok === false && result.body.error.error, "No matches found.")
        state.resolved = { resolved: [{}], failed: 0 }
    })

    it("returns 409 when the player is replaced before enqueue", async () => {
        state.enqueue = "no_player"
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 409)
        if (result.body.ok === false) {
            assert.equal(
                result.body.error.error,
                "Player stopped before the playlist could be queued. Try again."
            )
        }
        state.enqueue = { queued: 2 }
    })

    it("returns the queued playlist", async () => {
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, {
            playlistId: 1,
            shuffle: true,
        })
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.playlistName, "Mix")
            assert.equal(result.body.data.queued, 2)
        }
    })

    it("returns 500 when playlist play throws", async () => {
        state.clientThrows = true
        const result = await playerPlaylistPlayPOST(new Headers(), GUILD, { playlistId: 1 })
        assert.equal(result.status, 500)
        assert.equal(result.body.ok === false && result.body.error.error, "Internal server error.")
    })
})
